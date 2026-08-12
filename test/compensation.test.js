import assert from 'node:assert/strict';
import test from 'node:test';

import { INPUT_COMPENSATION } from '../src/compensation.js';

test('mirrors the C++ Compensation enum values', () => {
    assert.deepEqual(INPUT_COMPENSATION, {
        NONE: 0,
        BK5128: 1
    });
});
