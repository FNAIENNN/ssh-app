const tankStates = {
  'DRUM-1-A1': { drumNum: 1, tankName: 'A1', currentCount: 100, status: 'pending' },
  'DRUM-2-A2': { drumNum: 2, tankName: 'A2', currentCount: 200, status: 'pending' }
};

const sortedDrums = Object.values(tankStates).sort((a, b) => a.drumNum - b.drumNum);
const rows = Array.from({ length: Math.ceil(sortedDrums.length / 2) }).map((_, idx) => {
  const leftDrum = sortedDrums[idx * 2];
  const rightDrum = sortedDrums[idx * 2 + 1];
  return { leftDrum, rightDrum };
});
console.log("Rows output:", rows);
