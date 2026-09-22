import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildTankCardData,
    currentCycleNettingRecords,
    currentCycleStockingEvents,
} from '../src/features/trailNetting/tankCardData.js';

const tank = { id: 'tank-1', name: 'A1', start_date: '2026-01-01', quantity: 150000, hatchery: 'Alpha + Beta' };

test('additional stocking stays in the same active cycle and preserves netting history', () => {
    const events = currentCycleStockingEvents(tank, [
        { tank_id: 'tank-1', date: '2026-01-01', quantity: 100000, hatchery: 'Alpha', source: 'stocked' },
        { tank_id: 'tank-1', date: '2026-02-10', quantity: 50000, hatchery: 'Beta', source: 'stocked' },
    ]);
    const records = currentCycleNettingRecords(tank, [
        { date: '2026-02-01', final_count: 120 },
        { date: '2026-02-15', final_count: 105 },
    ]);

    assert.equal(events.length, 2);
    assert.equal(records.length, 2);
});

test('card uses final tank quantity and unique hatcheries from physical stocking events', () => {
    const result = buildTankCardData({
        tank,
        seedEntries: [
            { tank_id: 'tank-1', date: '2026-01-01', quantity: 100000, hatchery: 'Alpha', source: 'stocked' },
            { tank_id: 'tank-1', date: '2026-02-01', quantity: 25000, hatchery: 'Alpha', source: 'stocked' },
            { tank_id: 'tank-1', date: '2026-02-10', quantity: 25000, hatchery: 'Beta', source: 'stocked' },
            { tank_id: 'tank-1', date: '2026-02-11', quantity: 999, hatchery: 'Ignored', source: 'exchanged' },
        ],
        records: [{ date: '2026-02-15', final_count: 105 }],
        report: { latest_date: '2026-02-15', feed_consp_total: 850 },
    });

    assert.equal(result.quantity, 150000);
    assert.equal(result.hatchery, 'Alpha + Beta');
    assert.equal(result.latestCount, 105);
    assert.equal(result.latestCountDate, '2026-02-15');
    assert.equal(result.nettingCount, 1);
    assert.equal(result.feed, 850);
});

test('events and records before a restarted cycle are excluded', () => {
    const restartedTank = { ...tank, start_date: '2026-03-01', quantity: 40000, hatchery: 'Gamma' };
    const result = buildTankCardData({
        tank: restartedTank,
        seedEntries: [
            { tank_id: 'tank-1', date: '2026-01-01', quantity: 100000, hatchery: 'Alpha', source: 'stocked' },
            { tank_id: 'tank-1', date: '2026-03-01', quantity: 40000, hatchery: 'Gamma', source: 'stocked' },
        ],
        records: [
            { date: '2026-02-15', final_count: 105 },
            { date: '2026-04-15', final_count: 130 },
        ],
        report: { latest_date: '2026-02-15', latest_count: 105, feed_consp_total: 900 },
    });

    assert.equal(result.stockingEvents.length, 1);
    assert.equal(result.cycleRecords.length, 1);
    assert.equal(result.hatchery, 'Gamma');
    assert.equal(result.latestCount, 130);
    assert.equal(result.feed, null);
});

test('a new cycle does not display an old cycle report as its latest result', () => {
    const result = buildTankCardData({
        tank: { ...tank, start_date: '2026-03-01', quantity: 40000, hatchery: 'Gamma' },
        report: { latest_date: '2026-02-15', latest_count: 105, feed_consp_total: 900 },
    });

    assert.equal(result.latestCount, null);
    assert.equal(result.latestCountDate, null);
    assert.equal(result.feed, null);
});