import { isDemoMode } from '../../lib/supabaseClient';

export const MEDIA_BUCKET = 'media';

function unwrapStoredMedia(value) {
    let current = value;

    if (typeof current === 'string') {
        const trimmed = current.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                current = JSON.parse(trimmed);
            } catch {
                current = trimmed;
            }
        } else {
            current = trimmed;
        }
    }

    if (Array.isArray(current)) current = current[0];
    if (current && typeof current === 'object') {
        current = current.path || current.url || current.publicUrl || current.public_url;
    }

    return typeof current === 'string' && current.trim() ? current.trim() : null;
}

/** Return the object key inside the media bucket for old and current DB formats. */
export function normalizeMediaPath(value) {
    const stored = unwrapStoredMedia(value);
    if (!stored || stored.startsWith('data:') || stored.startsWith('blob:')) return null;

    let path = stored;
    if (/^https?:\/\//i.test(path)) {
        try {
            const pathname = decodeURIComponent(new URL(path).pathname);
            const marker = '/storage/v1/object/';
            const markerIndex = pathname.indexOf(marker);
            if (markerIndex === -1) return null;
            path = pathname.slice(markerIndex + marker.length);
            path = path.replace(/^(?:public|sign|authenticated)\//, '');
        } catch {
            return null;
        }
    }

    path = path.split('?')[0].replace(/^\/+/, '');
    while (path.startsWith(`${MEDIA_BUCKET}/`)) path = path.slice(MEDIA_BUCKET.length + 1).replace(/^\/+/, '');
    return path || null;
}

export function extensionForMimeType(mimeType = '') {
    const type = mimeType.toLowerCase().split(';')[0].trim();
    const extensions = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
    };
    return extensions[type] || (type.startsWith('audio/') ? type.slice(6) : 'bin');
}

export async function uploadPaymentEvidence(storage, source, prefix) {
    if (!source) return null;

    let blob = source;
    if (typeof source === 'string' && source.startsWith('data:')) {
        blob = await (await fetch(source)).blob();
    }
    if (!(blob instanceof Blob)) return normalizeMediaPath(blob);

    if (isDemoMode) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    const contentType = blob.type || 'application/octet-stream';
    const objectPath = `payment-evidence/${prefix}-${Date.now()}-${crypto.randomUUID()}.${extensionForMimeType(contentType)}`;
    const { data, error } = await storage.from(MEDIA_BUCKET).upload(objectPath, blob, {
        contentType,
        upsert: false,
    });
    if (error) throw error;

    const savedPath = normalizeMediaPath(data?.path || data?.fullPath || objectPath);
    if (!savedPath) throw new Error('Storage upload did not return a valid media object path');
    return savedPath;
}

/** Resolve private objects with the current authenticated session; supports legacy URL/object shapes. */
export async function resolvePaymentEvidenceUrl(storage, storedValue, expiresIn = 3600) {
    const original = unwrapStoredMedia(storedValue);
    if (!original) return null;
    // Existing data URLs remain viewable for backwards compatibility, but new uploads never store them.
    if (original.startsWith('data:') || original.startsWith('blob:')) return original;

    const path = normalizeMediaPath(original);
    if (!path) return /^https?:\/\//i.test(original) ? original : null;

    // Use getPublicUrl directly since MEDIA_BUCKET is public.
    // Signed URLs can sometimes generate valid tokens that fail to load in public buckets.
    const publicUrl = storage.from(MEDIA_BUCKET).getPublicUrl(path)?.data?.publicUrl;
    return publicUrl || (/^https?:\/\//i.test(original) ? original : null);
}
