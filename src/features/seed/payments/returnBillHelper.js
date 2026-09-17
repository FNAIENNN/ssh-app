import { supabase, TABLES } from '../../../lib/supabaseClient';

/**
 * Helper to upload photo/video to Supabase storage 'media' bucket
 * and return the serializable storage path/filename.
 * If upload fails (e.g. bucket does not exist or network error),
 * gracefully falls back to returning the dataUrl so bill creation is not blocked.
 */
export async function uploadReturnMedia(dataUrl, prefix) {
  if (!dataUrl) return null;
  // If already a remote path or URL, return as is
  if (typeof dataUrl === 'string' && !dataUrl.startsWith('data:')) {
    return dataUrl;
  }

  const isVideo = typeof dataUrl === 'string' && dataUrl.startsWith('data:video');
  const ext = isVideo ? 'webm' : 'jpg';
  const contentType = isVideo ? 'video/webm' : 'image/jpeg';

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const fileName = `${prefix}-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('media').upload(fileName, blob, { contentType });
    if (error) {
      console.warn('Storage media upload failed, falling back to dataUrl:', error.message || error);
      return dataUrl;
    }
    if (data?.path) {
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(data.path);
      return urlData?.publicUrl || data.path;
    }
    return fileName;
  } catch (err) {
    console.warn('uploadReturnMedia failed, falling back to dataUrl:', err.message || err);
    return dataUrl;
  }
}

/**
 * Shared Return Bill creator for:
 * - Packing Return
 * - Mixed → Packing Return
 * - Seed Van Return
 * - Mixed → Seed Van Return
 */
export async function generateReturnBill({
  siteId,
  userId,
  activeOrder,
  vehicleNo = '—',
  tankId = null,
  tankName = '—',
  sourceQty = 0,
  returnedQty = 0,
  remainingQty = 0,
  returnedPackets = 0,
  reason = '',
  photo = null,
  video = null,
  source = 'Packing', // 'Mixed - Packing' | 'Mixed - Seed Van' | 'Packing' | 'Seed Van'
}) {
  const cleanSiteId = siteId || activeOrder?.site_id || 'default-site';

  const cleanVehicleNo = vehicleNo && vehicleNo !== 'N/A' ? vehicleNo : (activeOrder?.vehicle_no || '—');
  const cleanTankName = tankName && tankName !== 'N/A' ? tankName : '—';

  // 1. Upload media first if present (non-blocking fallback)
  let photoPath = null;
  let videoPath = null;

  const mediaPrefixKey = (tankId || cleanTankName || 'tank').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (photo) {
    try {
      photoPath = await uploadReturnMedia(photo, `return-photo-${mediaPrefixKey}`);
    } catch (e) {
      console.warn('Photo upload failed:', e);
      photoPath = photo;
    }
  }
  if (video) {
    try {
      videoPath = await uploadReturnMedia(video, `return-video-${mediaPrefixKey}`);
    } catch (e) {
      console.warn('Video upload failed:', e);
      videoPath = video;
    }
  }

  const now = new Date();
  const billNumber = `RB-${Date.now().toString().slice(-6)}`;

  const numSourceQty = Number(sourceQty) || 0;
  const numReturnedQty = Number(returnedQty) || 0;
  const numRemainingQty = Number(remainingQty) || 0;
  const numPackets = Number(returnedPackets) || 0;
  const cleanReason = reason || '';
  const validCreatedBy = userId || null;

  const numPerPiecePrice = Number(activeOrder?.per_piece_price) || 0;
  const numRefundAmount = numReturnedQty * numPerPiecePrice;

  const packingDataObj = {
    order_id: activeOrder?.id || null,
    order_number: activeOrder?.bill_number || 'N/A',
    tank_id: tankId,
    tank_name: cleanTankName,
    vehicle_no: cleanVehicleNo,
    source_qty: numSourceQty,
    quantity: numReturnedQty,
    returned_qty: numReturnedQty,
    remaining_qty: numRemainingQty,
    packets: numPackets,
    reason: cleanReason,
    photo: photoPath,
    video: videoPath,
    return_date: now.toLocaleDateString('en-IN'),
    return_time: now.toLocaleTimeString('en-IN'),
    return_status: 'Returned'
  };

  const payload = {
    site_id: cleanSiteId,
    bill_number: billNumber,
    type: 'return_bill',
    report_type: 'return_bill',
    status: 'completed',
    ...(validCreatedBy ? { created_by: validCreatedBy } : {}),
    total_amount: numRefundAmount,
    paid_amount: numRefundAmount,
    balance_amount: 0,
    hatchery: activeOrder?.hatchery || 'N/A',
    supervisor_name: activeOrder?.supervisor_name || 'Field Supervisor',
    created_at: now.toISOString(),
    document_data: {
      original_bill_id: activeOrder?.id || null,
      original_bill_number: activeOrder?.bill_number || 'N/A',
      return_source: source,
      source: source,
      vehicle: cleanVehicleNo,
      vehicle_no: cleanVehicleNo,
      tank: cleanTankName,
      tank_name: cleanTankName,
      original_tank: cleanTankName,
      drum_name: cleanTankName,
      source_qty: numSourceQty,
      returned_qty: numReturnedQty,
      seed_count_returned: numReturnedQty,
      remaining_qty: numRemainingQty,
      packets: numPackets,
      reason: cleanReason,
      photo: photoPath,
      video: videoPath,
      finance_status: 'pending_finance',
      date: now.toISOString(),
      return_date: now.toLocaleDateString('en-IN'),
      return_time: now.toLocaleTimeString('en-IN'),
      return_status: 'Returned',
      per_piece_price: numPerPiecePrice,
      refund_amount: numRefundAmount,
      packing_data: packingDataObj
    }
  };

  let savedBill = null;
  try {
    const { data: billData, error: billError } = await supabase
      .from(TABLES.bills)
      .insert(payload)
      .select();

    if (billError) {
      console.error('Supabase insert return bill error:', billError);
      throw new Error(`Failed to save Return Bill: ${billError.message || JSON.stringify(billError)}`);
    } else {
      savedBill = (Array.isArray(billData) ? billData[0] : billData);
    }
  } catch (err) {
    console.error('Failed to insert return bill into Supabase:', err);
    throw err;
  }

  // Also insert payment record into TABLES.payments for complete store persistence
  try {
    const paymentPayload = {
      site_id: cleanSiteId,
      bill_id: savedBill.id,
      type: 'return',
      method: 'return',
      amount: numRefundAmount,
      status: 'returned',
      hatchery: activeOrder?.hatchery || 'N/A',
      holder_name: activeOrder?.hatchery || 'N/A',
      supervisor_name: activeOrder?.supervisor_name || 'Field Supervisor',
      ...(validCreatedBy ? { created_by: validCreatedBy } : {}),
      created_at: now.toISOString(),
      note: cleanReason,
      document_data: payload.document_data,
    };
    await supabase.from(TABLES.payments).insert(paymentPayload);
  } catch (pErr) {
    console.warn('Supabase insert return payment error:', pErr);
  }

  return { bill: savedBill, photoPath, videoPath };
}
