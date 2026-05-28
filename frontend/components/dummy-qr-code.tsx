const QR_PATTERN = [
  "111111100010101111111",
  "100000101110101000001",
  "101110101001001011101",
  "101110101111101011101",
  "101110100010101011101",
  "100000101101101000001",
  "111111101010101111111",
  "000000001111100000000",
  "110101101001011010110",
  "010011000110100111000",
  "111010111010011001101",
  "001101000111000101010",
  "101011101001110110111",
  "000000001010010000000",
  "111111101101111111111",
  "100000100010001000001",
  "101110101111001011101",
  "101110100001101011101",
  "101110101110101011101",
  "100000100101001000001",
  "111111101111101111111"
];

export function DummyQrCode() {
  return (
    <div className="rounded-[2rem] bg-white p-4 shadow-lg shadow-slate-950/20">
      <div
        className="grid gap-px bg-white"
        style={{ gridTemplateColumns: "repeat(21, minmax(0, 1fr))" }}
      >
        {QR_PATTERN.flatMap((row, rowIndex) =>
          row.split("").map((cell, columnIndex) => (
            <span
              key={`${rowIndex}-${columnIndex}`}
              className={`h-2.5 w-2.5 rounded-[2px] ${
                cell === "1" ? "bg-slate-950" : "bg-white"
              }`}
            />
          ))
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
        Dummy UPI QR
      </div>
    </div>
  );
}
