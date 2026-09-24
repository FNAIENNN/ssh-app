import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getAssignedVehicleIds,
    buildTankStockingSnapshot,
    getPackingSourceTanks,
    isTankInActiveSeedCycle,
    vehicleHasTank,
} from '../src/features/seed/payments/seedStocking/stockingUtils.js';

const tanks = [
    { id: 101, name: 'A1', qty: 1000 },
    { id: '102', name: 'A2', qty: 2000 },
    { id: '103', name: 'A3', qty: 3000 },
];

test('normal Packing resolves one vehicle and one tank from booking data', () => {
    const vehicle = { id: 'v1', tank_ids: ['101'] };
    const sourceTanks = getPackingSourceTanks({ selected_tanks: [tanks[0]] });

    assert.equal(sourceTanks.length, 1);
    assert.equal(vehicleHasTank(vehicle, sourceTanks[0]), true);
});

test('Trail Netting history tanks are not treated as Additional Stocking', () => {
    const tank = { id: 'tank-1', name: 'A1', start_date: '2026-01-01', quantity: 100000 };
    const entries = [{ tank_id: 'tank-1', date: '2026-01-01', source: 'stocked' }];
    const reports = [{ tank_id: 'tank-1', latest_date: '2026-02-15', process_details: { status: 'completed' } }];

    assert.equal(isTankInActiveSeedCycle(tank, entries, reports), false);
});

test('a tank stocked after its previous Trail Netting report is active again', () => {
    const tank = { id: 'tank-1', name: 'A1', start_date: '2026-01-01', quantity: 40000 };
    const entries = [
        { tank_id: 'tank-1', date: '2026-01-01', source: 'stocked' },
        { tank_id: 'tank-1', date: '2026-03-01', source: 'stocked' },
    ];
    const reports = [{ tank_id: 'tank-1', latest_date: '2026-02-15', process_details: { status: 'completed' } }];

    assert.equal(isTankInActiveSeedCycle(tank, entries, reports), true);
});

test('fresh stocking after Trail Netting history resets quantity and cycle date', () => {
    const snapshot = buildTankStockingSnapshot({
        matchedTank: {
            id: 'tank-1',
            quantity: 89000,
            start_date: '2026-08-01',
            hatchery: 'Old Hatchery',
            is_active_seed_cycle: false,
        },
        newQuantity: 9000,
        hatchery: 'New Hatchery',
        stockingDate: '2026-09-24',
    });

    assert.equal(snapshot.quantity, 9000);
    assert.equal(snapshot.start_date, '2026-09-24');
    assert.equal(snapshot.hatchery, 'New Hatchery');
});

test('normal Packing keeps multiple vehicle assignments separate', () => {
    const vehicles = [
        { id: 'v1', tank_ids: [101, '102'] },
        { id: 'v2', selectedTanks: [{ id: '103', name: 'A3' }] },
    ];
    const sourceTanks = getPackingSourceTanks({ selected_tanks: tanks });

    assert.deepEqual(sourceTanks.filter(t => vehicleHasTank(vehicles[0], t)).map(t => t.name), ['A1', 'A2']);
    assert.deepEqual(sourceTanks.filter(t => vehicleHasTank(vehicles[1], t)).map(t => t.name), ['A3']);
});

test('Mixed excludes Seed Van vehicle while retaining Packing vehicle tank mapping', () => {
    const vehicles = [
        { id: 'packing-v', tank_ids: ['101'] },
        { id: 'van-v', tank_ids: ['102'] },
    ];
    const order = {
        selected_tanks: tanks.slice(0, 2),
        van_plan: { 'van-v': { drums: [{ tankName: 'A2', count: 2000 }] } },
    };
    const { vanPlanVehicleIds } = getAssignedVehicleIds(order, null, null, null, vehicles);
    const packingVehicles = vehicles.filter(v => !vanPlanVehicleIds.has(String(v.id)));
    const sourceTanks = getPackingSourceTanks(order);

    assert.deepEqual(packingVehicles.map(v => v.id), ['packing-v']);
    assert.deepEqual(sourceTanks.filter(t => vehicleHasTank(packingVehicles[0], t)).map(t => t.name), ['A1']);
});

test('Mixed supports multiple Packing vehicles and merges saved packing values without duplicates', () => {
    const vehicles = [
        { id: 'v1', tank_ids: ['101'] },
        { id: 'v2', selectedTanks: [{ name: 'a2' }] },
    ];
    const sourceTanks = getPackingSourceTanks({
        selected_tanks: tanks.slice(0, 2),
        packing_data: { tanks: [{ id: '101', name: 'A1', quantity: 600, numberOfPackets: 6 }] },
    });

    assert.equal(sourceTanks.length, 2);
    assert.equal(sourceTanks.find(t => t.name === 'A1').quantity, 600);
    assert.equal(sourceTanks.filter(t => vehicleHasTank(vehicles[0], t)).length, 1);
    assert.equal(sourceTanks.filter(t => vehicleHasTank(vehicles[1], t)).length, 1);
});