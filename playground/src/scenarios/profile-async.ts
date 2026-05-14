import { runCpuHotspot } from './profile-cpu';

export type AsyncWorkloadSummary = {
  checksum: number;
  completedSteps: number;
  nestedResults: number[];
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runAsyncBurst(seed: number): Promise<AsyncWorkloadSummary> {
  let checksum = seed;
  const nestedResults: number[] = [];

  for (let step = 0; step < 6; step += 1) {
    await Promise.resolve();

    const cpuSummary = runCpuHotspot(seed + step * 29);
    nestedResults.push(cpuSummary.peak % 1000);
    checksum += cpuSummary.checksum % 100000;

    await delay(24);

    const wave = Array.from({ length: 160 }, (_, index) => ({
      key: `${step}-${index}`,
      metric: (checksum + index * 7) % 8192,
    }));
    checksum += wave.reduce((total, item) => total + item.metric, 0);
  }

  return {
    checksum,
    completedSteps: 6,
    nestedResults,
  };
}
