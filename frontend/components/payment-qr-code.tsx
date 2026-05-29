export function PaymentQrCode() {
  return (
    <div className="rounded-[2rem] bg-white p-4 shadow-lg shadow-slate-950/20">
      <img
        src="/payment/paytm-upi-qr.jpg"
        alt="Paytm UPI payment QR code"
        className="h-auto w-64 rounded-3xl"
      />
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
        Paytm UPI QR
      </div>
    </div>
  );
}

