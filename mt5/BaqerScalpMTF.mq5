//+------------------------------------------------------------------+
//| BaqerScalpMTF.mq5                                                 |
//| Scalp: 15m order-block zone, entry on a 1m order block.           |
//| Run on an M1 chart. Virtual trades only, no orders are sent.      |
//| InpMode "bos": 1m break of structure is required (current rule).  |
//| InpMode "ob" : no 1m break; a 1m fair value gap at price in the   |
//|                trade direction is the confirmation instead.       |
//| Mirrors scalpSetup() in pages-site/analysis.js.                   |
//+------------------------------------------------------------------+
#property strict
#property version "1.00"

input string InpMode     = "ob";           // ob | bos
input int    InpBars1    = 3000;           // 1m bars loaded (about 50 h)
input int    InpPivot    = 3;
input bool   InpWriteCsv = true;
input string InpCsvName  = "baqer_scalp_trades.csv";

#define MAXT 20000
#define NUL (-1.0e300)

struct Blk { int dir; int i; double lo; double hi; };
struct Res
{
   bool ready; double price; double atr;
   int evDir;
   bool hasOb; Blk ob; bool obStrong;
   bool hasFvg; Blk fvg;
};
struct Piv { int i; double p; };
struct VT  { bool open; bool isLong; double entry, sl, tp1, tp2, tp3; int tpHits; datetime t; };

double P_slMaxATR, P_buf, P_tp[3];
VT  vt[MAXT]; int nvt = 0;
int statWins = 0, statLoss = 0; double statPts = 0;
int fh = INVALID_HANDLE;
datetime lastBar = 0;
datetime lastSigBar = 0;
long gTicks = 0;
string gWhy = "init";
int gSignals = 0;

// 1m candles (chronological, index n1-1 = last closed bar)
double g1o[], g1h[], g1l[], g1c[]; datetime g1t[]; int n1 = 0;
// 15m candles built from closed 1m bars (the forming 15m bar is excluded)
double g15o[], g15h[], g15l[], g15c[]; datetime g15t[]; int n15 = 0;

bool IsNul(double x) { return x < -1.0e299; }

//+------------------------------------------------------------------+
void ATRs(const double &h[], const double &l[], const double &c[], int n, int len, double &out[])
{
   ArrayResize(out, n);
   for(int i = 0; i < n; i++) out[i] = NUL;
   if(n <= len) return;
   double tr[]; ArrayResize(tr, n);
   for(int i = 0; i < n; i++)
   {
      if(i == 0) tr[i] = h[i] - l[i];
      else tr[i] = MathMax(h[i] - l[i], MathMax(MathAbs(h[i] - c[i - 1]), MathAbs(l[i] - c[i - 1])));
   }
   double s = 0;
   for(int k = 1; k <= len; k++) s += tr[k];
   double prev = s / len; out[len] = prev;
   for(int j = len + 1; j < n; j++) { prev = (prev * (len - 1) + tr[j]) / len; out[j] = prev; }
}

//+------------------------------------------------------------------+
// Structure of one series: last swing, break of structure, order block, strong move, FVG.
void Core(const double &o[], const double &h[], const double &l[], const double &c[], int n, Res &r)
{
   r.ready = false; r.hasOb = false; r.obStrong = false; r.hasFvg = false; r.evDir = 0;
   r.ob.dir = 0; r.ob.i = -1; r.ob.lo = 0; r.ob.hi = 0;
   r.fvg.dir = 0; r.fvg.i = -1; r.fvg.lo = 0; r.fvg.hi = 0;
   if(n < 60) return;
   r.price = c[n - 1];
   double A[];
   ATRs(h, l, c, n, 14, A);
   r.atr = A[n - 1];
   if(IsNul(r.atr)) return;
   r.ready = true;

   // confirmed swings
   Piv H[], L[]; ArrayResize(H, n); ArrayResize(L, n);
   int nh = 0, nl = 0;
   for(int i = InpPivot; i < n - InpPivot; i++)
   {
      bool hi = true, lo = true;
      for(int j = i - InpPivot; j <= i + InpPivot; j++)
      {
         if(j == i) continue;
         if(h[j] >= h[i]) hi = false;
         if(l[j] <= l[i]) lo = false;
      }
      if(hi) { H[nh].i = i; H[nh].p = h[i]; nh++; }
      if(lo) { L[nl].i = i; L[nl].p = l[i]; nl++; }
   }
   bool hasSh = nh >= 1, hasSl = nl >= 1;
   Piv sh, sl;
   if(hasSh) sh = H[nh - 1];
   if(hasSl) sl = L[nl - 1];

   // break of structure: a close beyond the last swing in the last 20 bars
   int evI = -1, evDir = 0;
   for(int j = MathMax(0, n - 20); j < n; j++)
   {
      if(hasSh && j > sh.i && c[j] > sh.p) { evDir = 1;  evI = j; }
      if(hasSl && j > sl.i && c[j] < sl.p) { evDir = -1; evI = j; }
   }
   r.evDir = evDir;

   // order block: last opposite candle before the break (up to 12 bars back)
   if(evDir != 0)
   {
      for(int q = evI - 1; q >= MathMax(0, evI - 12); q--)
      {
         if(evDir == 1 && c[q] < o[q])  { r.hasOb = true; r.ob.dir = 1;  r.ob.i = q; r.ob.lo = l[q]; r.ob.hi = h[q]; break; }
         if(evDir == -1 && c[q] > o[q]) { r.hasOb = true; r.ob.dir = -1; r.ob.i = q; r.ob.lo = l[q]; r.ob.hi = h[q]; break; }
      }
   }
   // strong: an impulse of at least one ATR leaves the block within 3 bars
   if(r.hasOb)
   {
      int end = MathMin(n - 1, r.ob.i + 3);
      double best = 0;
      for(int j = r.ob.i + 1; j <= end; j++)
      {
         double mv = (r.ob.dir == 1) ? (h[j] - r.ob.hi) : (r.ob.lo - l[j]);
         if(mv > best) best = mv;
      }
      r.obStrong = (best >= r.atr);
   }

   // most recent unfilled fair value gap from the last 40 bars
   int gStart = MathMax(2, n - 40);
   for(int g = n - 1; g >= gStart; g--)
   {
      int dir = 0; double lo = 0, hi = 0;
      if(l[g] > h[g - 2])      { dir = 1;  lo = h[g - 2]; hi = l[g]; }
      else if(h[g] < l[g - 2]) { dir = -1; lo = h[g];     hi = l[g - 2]; }
      if(dir == 0) continue;
      int fi = g - 1;
      bool filled = false;
      for(int m = fi + 2; m < n; m++) { if(l[m] <= hi && h[m] >= lo) { filled = true; break; } }
      if(!filled) { r.hasFvg = true; r.fvg.dir = dir; r.fvg.i = fi; r.fvg.lo = lo; r.fvg.hi = hi; break; }
   }
}

//+------------------------------------------------------------------+
// Builds closed 15m candles from the 1m series. The 15m candle still forming is left out.
void BuildM15()
{
   ArrayResize(g15o, n1); ArrayResize(g15h, n1); ArrayResize(g15l, n1); ArrayResize(g15c, n1); ArrayResize(g15t, n1);
   n15 = 0;
   long curKey = -1;
   bool open = false;
   double o = 0, h = 0, l = 0, c = 0;
   for(int k = 0; k < n1; k++)
   {
      long key = (long)g1t[k] / 900;
      if(key != curKey)
      {
         if(open) { g15o[n15] = o; g15h[n15] = h; g15l[n15] = l; g15c[n15] = c; g15t[n15] = (datetime)(curKey * 900); n15++; }
         curKey = key; open = true;
         o = g1o[k]; h = g1h[k]; l = g1l[k]; c = g1c[k];
      }
      else
      {
         h = MathMax(h, g1h[k]); l = MathMin(l, g1l[k]); c = g1c[k];
      }
   }
}

//+------------------------------------------------------------------+
// Same rules as scalpSetup() in analysis.js. Returns true with the levels when a trade is set up now.
bool ScalpCheck(bool &isLong, double &entry, double &sl)
{
   if(n15 < 60 || n1 < 120) { gWhy = "not enough bars"; return false; }
   Res z, m;
   Core(g15o, g15h, g15l, g15c, n15, z);
   if(!z.ready || !z.hasOb || !z.obStrong) { gWhy = "no strong 15m order block"; return false; }
   int dir = (z.ob.dir == 1) ? 1 : -1;
   double tol = 0.3 * z.atr;
   double p1 = g1c[n1 - 1];
   if(p1 < z.ob.lo - tol || p1 > z.ob.hi + tol) { gWhy = "price not at 15m order block"; return false; }

   Core(g1o, g1h, g1l, g1c, n1, m);
   if(!m.ready) { gWhy = "1m not ready"; return false; }
   if(InpMode == "bos")
   {
      if(m.evDir != dir) { gWhy = "no 1m break of structure"; return false; }
   }
   else
   {
      bool fvgOk = m.hasFvg && m.fvg.dir == dir && p1 >= m.fvg.lo - tol && p1 <= m.fvg.hi + tol;
      if(!fvgOk) { gWhy = "no 1m fair value gap at price"; return false; }
   }
   if(!m.hasOb || m.ob.dir != dir) { gWhy = "no 1m order block in direction"; return false; }

   int k = m.ob.i;
   bool up = (dir == 1);
   entry = g1o[k];
   sl = up ? g1l[k] : g1h[k];
   bool valid = up ? (sl < entry) : (sl > entry);
   double risk = MathAbs(entry - sl);
   if(!valid || risk <= 0 || risk > P_slMaxATR * m.atr) { gWhy = "stop outside allowed range"; return false; }
   if(risk < 0.5 * m.atr) { gWhy = "stop too tight (below minimum ATR)"; return false; }
   // one trade per 1m order block candle: the same block stays a candidate on every new bar
   if(g1t[k] == lastSigBar) { gWhy = "same order block already traded"; return false; }
   lastSigBar = g1t[k];
   isLong = up;
   gWhy = up ? "LONG setup" : "SHORT setup";
   return true;
}

//+------------------------------------------------------------------+
void Log(string line)
{
   Print(line);
   if(fh != INVALID_HANDLE) FileWriteString(fh, line + "\r\n");
}

void OnClosed(const VT &tr, bool won, double pts, datetime when)
{
   if(won) statWins++; else statLoss++;
   statPts += pts;
   if(fh != INVALID_HANDLE)
      FileWriteString(fh, TimeToString(tr.t, TIME_DATE | TIME_MINUTES) + ";" + TimeToString(when, TIME_DATE | TIME_MINUTES) + ";" +
         (tr.isLong ? "BUY" : "SELL") + ";" + DoubleToString(tr.entry, _Digits) + ";" + DoubleToString(tr.sl, _Digits) + ";" +
         DoubleToString(tr.tp1, _Digits) + ";" + DoubleToString(tr.tp2, _Digits) + ";" + DoubleToString(tr.tp3, _Digits) + ";" +
         (won ? "WIN" : "LOSS") + ";" + IntegerToString(tr.tpHits) + ";" + DoubleToString(pts, _Digits) + "\r\n");
   Log(TimeToString(when, TIME_DATE | TIME_MINUTES) + "," + (won ? "WIN" : "LOSS") + "," + (tr.isLong ? "BUY" : "SELL") +
       "," + DoubleToString(tr.entry, _Digits) + "," + DoubleToString(pts, _Digits) + " pts,tpHits=" + IntegerToString(tr.tpHits));
}

// Same exit order as the monitor: stop first, then TP1, TP2, TP3.
void ProcessBar(double hiB, double loB, datetime tB)
{
   for(int k = 0; k < nvt; k++)
   {
      if(!vt[k].open) continue;
      if(vt[k].t >= tB) continue;
      bool L = vt[k].isLong;
      bool stop = L ? (loB <= vt[k].sl) : (hiB >= vt[k].sl);
      if(stop)
      {
         bool won = vt[k].tpHits > 0;
         double lvl = vt[k].sl;
         if(won) lvl = (vt[k].tpHits == 1) ? vt[k].tp1 : (vt[k].tpHits == 2 ? vt[k].tp2 : vt[k].tp3);
         double pts = won ? MathAbs(lvl - vt[k].entry) : -MathAbs(vt[k].entry - vt[k].sl);
         OnClosed(vt[k], won, pts, tB);
         vt[k].open = false;
         continue;
      }
      for(int lv = vt[k].tpHits + 1; lv <= 3; lv++)
      {
         double level = (lv == 1) ? vt[k].tp1 : (lv == 2 ? vt[k].tp2 : vt[k].tp3);
         bool hit = L ? (hiB >= level) : (loB <= level);
         if(!hit) break;
         vt[k].tpHits = lv;
         Log(TimeToString(tB, TIME_DATE | TIME_MINUTES) + ",TP" + IntegerToString(lv) + "," + (L ? "BUY" : "SELL") + "," + DoubleToString(level, _Digits));
         if(lv == 3) { OnClosed(vt[k], true, MathAbs(level - vt[k].entry), tB); vt[k].open = false; break; }
      }
   }
}

void OpenVirtual(bool isLong, double entry, double sl, datetime t)
{
   for(int k = 0; k < nvt; k++)
      if(vt[k].open && vt[k].isLong == isLong && MathAbs(vt[k].entry - entry) < _Point) return;
   if(nvt >= MAXT) return;
   double risk = MathAbs(entry - sl);
   double sg = isLong ? 1 : -1;
   vt[nvt].open = true; vt[nvt].isLong = isLong; vt[nvt].entry = entry; vt[nvt].sl = sl;
   vt[nvt].tp1 = entry + sg * P_tp[0] * risk;
   vt[nvt].tp2 = entry + sg * P_tp[1] * risk;
   vt[nvt].tp3 = entry + sg * P_tp[2] * risk;
   vt[nvt].tpHits = 0; vt[nvt].t = t;
   nvt++;
   gSignals++;
   Log(TimeToString(t, TIME_DATE | TIME_MINUTES) + ",OPEN," + (isLong ? "BUY" : "SELL") + "," + DoubleToString(entry, _Digits) +
       ",SL " + DoubleToString(sl, _Digits));
}

//+------------------------------------------------------------------+
int OnInit()
{
   // scalp profile (same as analysis.js PROFILES.scalp)
   P_slMaxATR = 0.9; P_buf = 0.1; P_tp[0] = 1.2; P_tp[1] = 2; P_tp[2] = 3;
   if(InpWriteCsv)
   {
      fh = FileOpen(InpCsvName, FILE_WRITE | FILE_TXT | FILE_ANSI);
      if(fh != INVALID_HANDLE) FileWriteString(fh, "open;close;side;entry;stop;tp1;tp2;tp3;result;tpHits;points\r\n");
   }
   Log("BaqerScalpMTF started, mode=" + InpMode);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   int closed = statWins + statLoss;
   Log("SUMMARY mode=" + InpMode + " closed=" + IntegerToString(closed) +
       " wins=" + IntegerToString(statWins) + " losses=" + IntegerToString(statLoss) +
       " winRate=" + (closed > 0 ? DoubleToString(100.0 * statWins / closed, 1) : "0") + "%" +
       " net=" + DoubleToString(statPts, 5) + " price units");
   if(fh != INVALID_HANDLE) FileClose(fh);
}

void OnTick()
{
   gTicks++;
   datetime cur = iTime(_Symbol, _Period, 0);
   if(cur == lastBar) return;
   lastBar = cur;

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int got = CopyRates(_Symbol, _Period, 1, InpBars1, rates);
   if(got < 120) return;

   n1 = got;
   ArrayResize(g1o, n1); ArrayResize(g1h, n1); ArrayResize(g1l, n1); ArrayResize(g1c, n1); ArrayResize(g1t, n1);
   for(int k = 0; k < n1; k++)
   {
      g1o[k] = rates[k].open; g1h[k] = rates[k].high; g1l[k] = rates[k].low;
      g1c[k] = rates[k].close; g1t[k] = rates[k].time;
   }
   BuildM15();

   ProcessBar(g1h[n1 - 1], g1l[n1 - 1], g1t[n1 - 1]);
   bool isLong = false; double entry = 0, sl = 0;
   if(ScalpCheck(isLong, entry, sl)) OpenVirtual(isLong, entry, sl, g1t[n1 - 1]);

   Comment("BaqerScalpMTF " + InpMode + "\n1m bars " + IntegerToString(n1) + "  15m bars " + IntegerToString(n15) +
           "\nopen " + IntegerToString(nvt) + "  closed " + IntegerToString(statWins + statLoss) +
           "  wins " + IntegerToString(statWins) + "\nsignals " + IntegerToString(gSignals) + "\nlast: " + gWhy);
}
//+------------------------------------------------------------------+
