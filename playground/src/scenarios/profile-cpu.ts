export type CpuWorkloadSummary = {
  checksum: number;
  peak: number;
  branchHits: [number, number, number];
};

function createRow(seed: number, width: number) {
  return Array.from({ length: width }, (_, index) => ((seed + 17) * (index + 11)) % 9973);
}

function mixString(seed: number) {
  const base = `cpu-${seed.toString(16)}`.padEnd(24, 'x');
  return base.repeat(3).slice(seed % 9, seed % 9 + 48);
}

export function runCpuHotspot(seed: number): CpuWorkloadSummary {
  let checksum = seed;
  let peak = 0;
  const branchHits: [number, number, number] = [0, 0, 0];

  for (let outer = 0; outer < 260; outer += 1) {
    const row = createRow(seed + outer * 13, 96);
    const label = mixString(seed + outer);

    for (let inner = 0; inner < row.length; inner += 1) {
      const value = row[inner] ?? 0;
      const branch = (outer + inner) % 3;
      branchHits[branch] += 1;

      if (branch === 0) {
        checksum += value * (inner + 1);
      } else if (branch === 1) {
        checksum ^= value << (inner % 4);
      } else {
        checksum -= value * (outer + 3);
      }

      peak = Math.max(peak, (checksum + label.charCodeAt(inner % label.length)) % 500000);
    }
  }

  return {
    checksum,
    peak,
    branchHits,
  };
}
