import test from 'node:test';
import assert from 'node:assert/strict';

import { extensionForMimeType, normalizeMediaPath, resolvePaymentEvidenceUrl } from '../src/components/payments/mediaEvidence.js';

test('normalizes current and legacy media bucket paths', () => {
    assert.equal(normalizeMediaPath('payment-evidence/bank-photo.jpg'), 'payment-evidence/bank-photo.jpg');
    assert.equal(normalizeMediaPath('media/media/bank-voice.webm'), 'bank-voice.webm');
    assert.equal(normalizeMediaPath({ path: 'media/bank-photo.png' }), 'bank-photo.png');
    assert.equal(
        normalizeMediaPath('https://project.supabase.co/storage/v1/object/public/media/folder/photo.jpg?download=1'),
        'folder/photo.jpg',
    );
});

test('uses the recorded MIME type for the matching file extension', () => {
    assert.equal(extensionForMimeType('audio/webm;codecs=opus'), 'webm');
    assert.equal(extensionForMimeType('audio/mp4'), 'm4a');
    assert.equal(extensionForMimeType('audio/ogg; codecs=opus'), 'ogg');
    assert.equal(extensionForMimeType('image/png'), 'png');
    assert.equal(extensionForMimeType('video/webm'), 'webm');
    assert.equal(extensionForMimeType('video/mp4'), 'mp4');
});

test('resolves legacy public URLs through an authenticated signed URL', async () => {
    let signedPath;
    const storage = {
        from: () => ({
            createSignedUrl: async (path) => {
                signedPath = path;
                return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
            },
            getPublicUrl: () => ({ data: { publicUrl: 'unused' } }),
        }),
    };
    const result = await resolvePaymentEvidenceUrl(
        storage,
        'https://project.supabase.co/storage/v1/object/public/media/bank-voice.webm',
    );
    assert.equal(signedPath, 'bank-voice.webm');
    assert.equal(result, 'https://signed.example/bank-voice.webm');
});