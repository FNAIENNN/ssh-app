const step1Data_from_order = { drums: [{drumNum: 1, tankName: 'A1', count: 100}] };
const selectedVehicle = { id: 'veh-1' };
const vehicles = [selectedVehicle];

function getVehicleData(data, vId) {
  if (!data || !vId) return null;
  if (data[vId]) return data[vId];
  if ((data.drums || data.rows || data.tankStates) && vehicles[0]?.id === vId) {
    return data;
  }
  return null;
}

const step1Data = getVehicleData(step1Data_from_order, selectedVehicle.id);
console.log("step1Data for StockingStatusStep2:", step1Data);

const map = {};
if (step1Data?.drums && Array.isArray(step1Data.drums)) {
  step1Data.drums.forEach((d) => {
    if (!d.tankName) return;
    const drumKey = `DRUM-${d.drumNum}-${String(d.tankName).trim().toUpperCase()}`;
    map[drumKey] = {
      drumKey,
      tankName: d.tankName,
      originalCount: Number(d.count) || 0,
      currentCount: Number(d.count) || 0,
      status: 'pending',
      drumNum: d.drumNum,
    };
  });
}
console.log("tankStates:", map);
