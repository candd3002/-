//+------------------------------------------------------------------+
//| BaqerVirtual.mq5                                                  |
//| Mirrors pages-site/analysis.js and the monitor's trade rules.     |
//| Virtual trades only: no orders are sent. Results go to the        |
//| Experts log and to a CSV file in the tester's Files folder.       |
//+------------------------------------------------------------------+
#property strict
#property version "1.00"
#property description "Virtual-trade backtest of the Baqer analysis engine"

input string InpProfile    = "balanced";   // balanced | sniper
input int    InpBars       = 600;          // closed bars used for each analysis
input int    InpPivot      = 3;            // bars on each side to confirm a swing
input int    InpThreshold  = 6;            // minimum score
input int    InpMinConfirm = 3;            // minimum confirmations
input bool   InpWriteCsv   = true;
input string InpCsvName    = "baqer_virtual_trades.csv";

#define NUL (-1.0e300)
#define MAXT 500

double P_slMaxATR, P_buf, P_tp[3];

//--- chronological candle arrays (index n-1 = last closed bar)
double O[], Hh[], Ll[], Cc[];
datetime T[];

struct Piv   { int i; double p; };
struct FVG   { int dir; int i; double lo; double hi; };
struct OBk   { int dir; int i; double lo; double hi; };
struct Ev    { int dir; int i; double level; };
struct Sweep { int dir; int i; double wick; };
struct Sig   { bool ok; bool isLong; double entry, sl, tp1, tp2, tp3; };
struct VTrade{ bool open; bool isLong; double entry, sl, tp1, tp2, tp3; int tpHits; datetime t; };

Piv gH[], gL[]; int gnH = 0, gnL = 0;
FVG gF[];       int gnF = 0;
VTrade vt[MAXT]; int nvt = 0;
int   statWins = 0, statLoss = 0;
double statPts = 0;
int   fh = INVALID_HANDLE;
datetime lastBar = 0;
string gWhy = "init";
int gTicks = 0, gBars = 0, gSignals = 0;

bool IsNul(double x) { return x < -1.0e299; }

//+------------------------------------------------------------------+
void EMAc(const double &v[], int n, int len, double &out[])
{
   ArrayResize(out, n);
   for(int i = 0; i < n; i++) out[i] = NUL;
   if(n < len) return;
   double s = 0;
   for(int i = 0; i < len; i++) s += v[i];
   double prev = s / len; out[len - 1] = prev;
   double k = 2.0 / (len + 1);
   for(int j = len; j < n; j++) { prev = v[j] * k + prev * (1 - k); out[j] = prev; }
}

void RSIc(const double &v[], int n, int len, double &out[])
{
   ArrayResize(out, n);
   for(int i = 0; i < n; i++) out[i] = NUL;
   if(n <= len) return;
   double g = 0, l = 0;
   for(int i = 1; i <= len; i++) { double d = v[i] - v[i - 1]; if(d >= 0) g += d; else l -= d; }
   double ag = g / len, al = l / len;
   out[len] = (al == 0) ? 100 : 100 - 100 / (1 + ag / al);
   for(int j = len + 1; j < n; j++)
   {
      double dd = v[j] - v[j - 1];
      ag = (ag * (len - 1) + (dd > 0 ? dd : 0)) / len;
      al = (al * (len - 1) + (dd < 0 ? -dd : 0)) / len;
      out[j] = (al == 0) ? 100 : 100 - 100 / (1 + ag / al);
   }
}

void ATRc(int n, int len, double &out[])
{
   ArrayResize(out, n);
   for(int i = 0; i < n; i++) out[i] = NUL;
   if(n <= len) return;
   double tr[]; ArrayResize(tr, n);
   for(int i = 0; i < n; i++)
   {
      if(i == 0) tr[i] = Hh[i] - Ll[i];
      else tr[i] = MathMax(Hh[i] - Ll[i], MathMax(MathAbs(Hh[i] - Cc[i - 1]), MathAbs(Ll[i] - Cc[i - 1])));
   }
   double s = 0;
   for(int k = 1; k <= len; k++) s += tr[k];
   double prev = s / len; out[len] = prev;
   for(int j = len + 1; j < n; j++) { prev = (prev * (len - 1) + tr[j]) / len; out[j] = prev; }
}

//+------------------------------------------------------------------+
void Swings(int n, int k)
{
   ArrayResize(gH, n); ArrayResize(gL, n);
   gnH = 0; gnL = 0;
   for(int i = k; i < n - k; i++)
   {
      bool hi = true, lo = true;
      for(int j = i - k; j <= i + k; j++)
      {
         if(j == i) continue;
         if(Hh[j] >= Hh[i]) hi = false;
         if(Ll[j] <= Ll[i]) lo = false;
      }
      if(hi) { gH[gnH].i = i; gH[gnH].p = Hh[i]; gnH++; }
      if(lo) { gL[gnL].i = i; gL[gnL].p = Ll[i]; gnL++; }
   }
}

void FVGs(int n, int from)
{
   ArrayResize(gF, n); gnF = 0;
   for(int g = MathMax(2, from); g < n; g++)
   {
      if(Ll[g] > Hh[g - 2])      { gF[gnF].dir = 1;  gF[gnF].lo = Hh[g - 2]; gF[gnF].hi = Ll[g];     gF[gnF].i = g - 1; gnF++; }
      else if(Hh[g] < Ll[g - 2]) { gF[gnF].dir = -1; gF[gnF].lo = Hh[g];     gF[gnF].hi = Ll[g - 2]; gF[gnF].i = g - 1; gnF++; }
   }
}

// Returns 1 bull breakout, -1 bear breakout, 0 none.
int Congestion(int n, const double &A[])
{
   int end = n - 2, start = end - 30 + 1;
   if(start < 0 || IsNul(A[end])) return 0;
   double hi = -DBL_MAX, lo = DBL_MAX;
   for(int i = start; i <= end; i++) { hi = MathMax(hi, Hh[i]); lo = MathMin(lo, Ll[i]); }
   double range = hi - lo;
   if(range <= 0) return 0;
   double ratio = MathAbs(Cc[end] - Cc[start]) / range;
   if(!(ratio <= 0.4 && range <= 5 * A[end])) return 0;
   double bodySum = 0; int cnt = 0;
   for(int j = n - 1 - 20; j < n - 1; j++) { if(j < 0) continue; bodySum += MathAbs(Cc[j] - O[j]); cnt++; }
   double avgBody = (cnt > 0) ? bodySum / cnt : 0;
   double body = MathAbs(Cc[n - 1] - O[n - 1]);
   if(body >= 1.5 * avgBody)
   {
      if(Cc[n - 1] > hi) return 1;
      if(Cc[n - 1] < lo) return -1;
   }
   return 0;
}

// 1 = false break, 2 = pending, 3 = held
int BreakQ(int n, const Ev &ev)
{
   int to = MathMin(n, ev.i + 4), from = ev.i + 1, cnt = 0;
   bool fail = false;
   for(int k = from; k < to; k++)
   {
      cnt++;
      if(ev.dir == 1 ? (Cc[k] < ev.level) : (Cc[k] > ev.level)) fail = true;
   }
   if(fail) return 1;
   if(cnt < 3) return 2;
   return 3;
}

bool OBStrong(int n, const OBk &ob, double atrV)
{
   int end = MathMin(n - 1, ob.i + 3);
   double best = 0;
   for(int j = ob.i + 1; j <= end; j++)
   {
      double mv = (ob.dir == 1) ? (Hh[j] - ob.hi) : (ob.lo - Ll[j]);
      if(mv > best) best = mv;
   }
   return best >= atrV;
}

void Add(int &sc, int &ct, bool ok, int w) { if(ok) { sc += w; ct++; } }

Sig Build(bool up, double price, double atrV, bool hasSh, const Piv &sh, bool hasSl, const Piv &sl,
          const OBk &ob, const Sweep &sw, int n)
{
   Sig s; s.ok = false; s.isLong = up;
   double entry = price;
   if((up && Cc[n - 1] > O[n - 1]) || (!up && Cc[n - 1] < O[n - 1])) entry = O[n - 1];
   int want = up ? 1 : -1;
   double cands[4]; int nc = 0;
   if(ob.dir == want) cands[nc++] = up ? ob.lo : ob.hi;
   else
   {
      if(up) { if(hasSl) cands[nc++] = sl.p; }
      else   { if(hasSh) cands[nc++] = sh.p; }
      if(sw.dir == want) cands[nc++] = sw.wick;
   }
   if(nc == 0) return s;
   double mn = cands[0], mx = cands[0];
   for(int k = 1; k < nc; k++) { mn = MathMin(mn, cands[k]); mx = MathMax(mx, cands[k]); }
   double stop = up ? mn - P_buf * atrV : mx + P_buf * atrV;
   double risk = MathAbs(entry - stop);
   bool valid = up ? (stop < entry) : (stop > entry);
   if(!valid || risk < 0.5 * atrV || risk > P_slMaxATR * atrV) return s;
   double sg = up ? 1 : -1;
   s.ok = true; s.entry = entry; s.sl = stop;
   s.tp1 = entry + sg * P_tp[0] * risk;
   s.tp2 = entry + sg * P_tp[1] * risk;
   s.tp3 = entry + sg * P_tp[2] * risk;
   return s;
}

//+------------------------------------------------------------------+
// Same decision as analysis.js analyze() with no learning.
Sig Analyze(int n)
{
   Sig none; none.ok = false; none.isLong = false; none.entry = 0; none.sl = 0; none.tp1 = 0; none.tp2 = 0; none.tp3 = 0;
   if(n < 60) { gWhy = "need 60 bars, have " + IntegerToString(n); return none; }
   double closes[]; ArrayResize(closes, n);
   for(int k = 0; k < n; k++) closes[k] = Cc[k];
   double E[], R[], A[];
   EMAc(closes, n, 50, E); RSIc(closes, n, 14, R); ATRc(n, 14, A);
   int i = n - 1;
   double price = Cc[i], ema50 = E[i], rsiV = R[i], atrV = A[i];
   if(IsNul(ema50) || IsNul(rsiV) || IsNul(atrV) || IsNul(E[i - 5])) { gWhy = "indicators not ready"; return none; }

   Swings(n, InpPivot);
   bool hasSh = gnH >= 1, hasSh2 = gnH >= 2, hasSl = gnL >= 1, hasSl2 = gnL >= 2;
   Piv sh, sh2, sl, sl2;
   if(hasSh)  sh  = gH[gnH - 1];
   if(hasSh2) sh2 = gH[gnH - 2];
   if(hasSl)  sl  = gL[gnL - 1];
   if(hasSl2) sl2 = gL[gnL - 2];

   int trend = 0;
   if(hasSh && hasSh2 && hasSl && hasSl2)
   {
      if(sh.p > sh2.p && sl.p > sl2.p) trend = 1;
      else if(sh.p < sh2.p && sl.p < sl2.p) trend = -1;
   }

   Ev ev; ev.dir = 0; ev.i = -1; ev.level = 0;
   for(int j = MathMax(0, n - 20); j < n; j++)
   {
      if(hasSh && j > sh.i && Cc[j] > sh.p) { ev.dir = 1;  ev.i = j; ev.level = sh.p; }
      if(hasSl && j > sl.i && Cc[j] < sl.p) { ev.dir = -1; ev.i = j; ev.level = sl.p; }
   }

   Sweep sw; sw.dir = 0; sw.i = -1; sw.wick = 0;
   for(int s = MathMax(0, n - 4); s < n; s++)
   {
      for(int a = MathMax(0, gnH - 3); a < gnH; a++)
      {
         Piv p = gH[a];
         if(s > p.i && Hh[s] > p.p && Cc[s] < p.p) { sw.dir = -1; sw.i = s; sw.wick = Hh[s]; }
      }
      for(int a = MathMax(0, gnL - 3); a < gnL; a++)
      {
         Piv p = gL[a];
         if(s > p.i && Ll[s] < p.p && Cc[s] > p.p) { sw.dir = 1; sw.i = s; sw.wick = Ll[s]; }
      }
   }

   FVGs(n, n - 40);
   FVG fv; bool hasF = false;
   for(int f = gnF - 1; f >= 0 && !hasF; f--)
   {
      bool filled = false;
      for(int m = gF[f].i + 2; m < n; m++) { if(Ll[m] <= gF[f].hi && Hh[m] >= gF[f].lo) { filled = true; break; } }
      if(!filled) { fv = gF[f]; hasF = true; }
   }

   OBk ob; ob.dir = 0; ob.i = -1; ob.lo = 0; ob.hi = 0;
   if(ev.dir != 0)
   {
      for(int o = ev.i - 1; o >= MathMax(0, ev.i - 12); o--)
      {
         if(ev.dir == 1 && Cc[o] < O[o])  { ob.dir = 1;  ob.lo = Ll[o]; ob.hi = Hh[o]; ob.i = o; break; }
         if(ev.dir == -1 && Cc[o] > O[o]) { ob.dir = -1; ob.lo = Ll[o]; ob.hi = Hh[o]; ob.i = o; break; }
      }
   }

   int pd = 0; // 1 discount, -1 premium
   if(gnH > 0 && gnL > 0)
   {
      double rHi = gH[gnH - 1].p; if(gnH > 1) rHi = MathMax(rHi, gH[gnH - 2].p);
      double rLo = gL[gnL - 1].p; if(gnL > 1) rLo = MathMin(rLo, gL[gnL - 2].p);
      if(rHi > rLo) { double eq = (rHi + rLo) / 2; pd = (price < eq) ? 1 : -1; }
   }

   int cg = Congestion(n, A);
   int bq = (ev.dir != 0) ? BreakQ(n, ev) : 0;
   bool obStrong = (ob.dir != 0) ? OBStrong(n, ob, atrV) : false;
   double tol = 0.3 * atrV;
   bool rising = ema50 > E[i - 5];

   int score[2] = {0, 0}, cnt[2] = {0, 0};
   for(int s = 0; s < 2; s++)
   {
      int d = (s == 0) ? 1 : -1; bool up = (d == 1);
      Add(score[s], cnt[s], up ? (price > ema50) : (price < ema50), 1);
      Add(score[s], cnt[s], up ? rising : !rising, 1);
      Add(score[s], cnt[s], up ? (rsiV >= 45 && rsiV <= 68) : (rsiV >= 32 && rsiV <= 55), 1);
      Add(score[s], cnt[s], (ev.dir == d && bq != 1), 2);
      Add(score[s], cnt[s], (sw.dir == d), 2);
      Add(score[s], cnt[s], (hasF && fv.dir == d && price >= fv.lo - tol && price <= fv.hi + tol), 1);
      Add(score[s], cnt[s], (ob.dir == d && price >= ob.lo - tol && price <= ob.hi + tol && obStrong), 1);
      Add(score[s], cnt[s], (pd == (up ? 1 : -1)), 1);
      Add(score[s], cnt[s], (cg == d), 2);
   }

   int thr = InpThreshold;
   bool blockLong = rsiV >= 70, blockShort = rsiV <= 30;
   bool brkLong = (ev.dir == 1 && bq != 1), brkShort = (ev.dir == -1 && bq != 1);
   bool qualLong  = score[0] >= thr && cnt[0] >= InpMinConfirm && !blockLong  && brkLong;
   bool qualShort = score[1] >= thr && cnt[1] >= InpMinConfirm && !blockShort && brkShort;

   gWhy = "no setup: L " + IntegerToString(score[0]) + "/" + IntegerToString(cnt[0]) + " S " + IntegerToString(score[1]) + "/" + IntegerToString(cnt[1]) + " BOS " + IntegerToString(ev.dir) + " rsi " + DoubleToString(rsiV, 0);
   if(qualLong && !qualShort) { gWhy = "LONG candidate"; return Build(true,  price, atrV, hasSh, sh, hasSl, sl, ob, sw, n); }
   if(qualShort && !qualLong) { gWhy = "SHORT candidate"; return Build(false, price, atrV, hasSh, sh, hasSl, sl, ob, sw, n); }
   return none;
}

//+------------------------------------------------------------------+
void Log(string line)
{
   Print(line);
   if(fh != INVALID_HANDLE) FileWriteString(fh, line + "\r\n");
}

void OnClosed(const VTrade &tr, bool won, double pts, datetime when)
{
   if(won) statWins++; else statLoss++;
   statPts += pts;
   Log(TimeToString(when, TIME_DATE | TIME_MINUTES) + "," + (won ? "WIN" : "LOSS") + "," +
       (tr.isLong ? "BUY" : "SELL") + "," + DoubleToString(tr.entry, _Digits) + "," +
       DoubleToString(pts, _Digits) + " pts,tpHits=" + IntegerToString(tr.tpHits));
}

// Processes the newly closed bar for every open virtual trade (same order as the monitor).
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
         Log(TimeToString(tB, TIME_DATE | TIME_MINUTES) + ",TP" + IntegerToString(lv) + "," +
             (L ? "BUY" : "SELL") + "," + DoubleToString(level, _Digits));
         if(lv == 3) { OnClosed(vt[k], true, MathAbs(level - vt[k].entry), tB); vt[k].open = false; break; }
      }
   }
}

void OpenVirtual(const Sig &s, datetime t)
{
   for(int k = 0; k < nvt; k++)
      if(vt[k].open && vt[k].isLong == s.isLong && MathAbs(vt[k].entry - s.entry) < _Point) return;
   if(nvt >= MAXT) return;
   vt[nvt].open = true; vt[nvt].isLong = s.isLong; vt[nvt].entry = s.entry; vt[nvt].sl = s.sl;
   vt[nvt].tp1 = s.tp1; vt[nvt].tp2 = s.tp2; vt[nvt].tp3 = s.tp3; vt[nvt].tpHits = 0; vt[nvt].t = t;
   nvt++;
   Log(TimeToString(t, TIME_DATE | TIME_MINUTES) + ",OPEN," + (s.isLong ? "BUY" : "SELL") + "," +
       DoubleToString(s.entry, _Digits) + ",SL " + DoubleToString(s.sl, _Digits) +
       ",TP1 " + DoubleToString(s.tp1, _Digits));
}

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpProfile == "sniper") { P_slMaxATR = 1.2; P_buf = 0.1; P_tp[0] = 3;   P_tp[1] = 5;   P_tp[2] = 8; }
   else                        { P_slMaxATR = 4;   P_buf = 0.2; P_tp[0] = 1.5; P_tp[1] = 2.5; P_tp[2] = 4; }
   if(InpWriteCsv)
   {
      fh = FileOpen(InpCsvName, FILE_WRITE | FILE_TXT | FILE_ANSI);
      if(fh != INVALID_HANDLE) FileWriteString(fh, "time,event,side,price,detail\r\n");
   }
   Log("BaqerVirtual started, profile=" + InpProfile);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   int closed = statWins + statLoss;
   Log("SUMMARY profile=" + InpProfile + " closed=" + IntegerToString(closed) +
       " wins=" + IntegerToString(statWins) + " losses=" + IntegerToString(statLoss) +
       " winRate=" + (closed > 0 ? DoubleToString(100.0 * statWins / closed, 1) : "0") + "%" +
       " net=" + DoubleToString(statPts, 2) + " pts");
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
   int got = CopyRates(_Symbol, _Period, 1, InpBars, rates); // bar 1 = last closed bar
   gBars = got;
   if(got < 60) { Comment("BaqerVirtual: only " + IntegerToString(got) + " bars"); return; }

   ArrayResize(O, got); ArrayResize(Hh, got); ArrayResize(Ll, got); ArrayResize(Cc, got); ArrayResize(T, got);
   for(int k = 0; k < got; k++)
   {
      O[k] = rates[k].open; Hh[k] = rates[k].high; Ll[k] = rates[k].low;
      Cc[k] = rates[k].close; T[k] = rates[k].time;
   }

   ProcessBar(Hh[got - 1], Ll[got - 1], T[got - 1]);
   Sig s = Analyze(got);
   if(s.ok) { OpenVirtual(s, T[got - 1]); gSignals++; }
   Comment("BaqerVirtual " + InpProfile + "\nticks " + IntegerToString(gTicks) + " bars " + IntegerToString(gBars) +
           "\nopen " + IntegerToString(nvt) + " closed " + IntegerToString(statWins + statLoss) +
           " wins " + IntegerToString(statWins) + "\nsignals " + IntegerToString(gSignals) + "\nlast: " + gWhy);
   if(gTicks <= 2) Print("BaqerVirtual OnTick called, bars=", got);
}
//+------------------------------------------------------------------+
