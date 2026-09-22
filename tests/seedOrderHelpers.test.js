import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getResumeStep,
    isOrderFullyCompleted,
} from '../src/features/seed/payments/seedOrderHelpers.js';

for (const returnSource of ['Packing', 'Seed Van Plan', 'Mixed']) {
    test(`${returnSource} return bills are completed records, not resumable past orders`, () => {
        const returnBill = {
            type: 'return_bill',
            report_type: 'return_bill',
            status: 'completed',
            document_data: { return_source: returnSource },
        };

        assert.equal(isOrderFullyCompleted(returnBill), true);
        assert.equal(getResumeStep(returnBill), 'history');
    });
}

test('an incomplete seed order remains resumable', () => {
    const seedOrder = { type: 'seed', status: 'Pending Seed Stocking', current_stage: 'van-plan' };

    assert.equal(isOrderFullyCompleted(seedOrder), false);
    assert.equal(getResumeStep(seedOrder), 'van-plan');
});