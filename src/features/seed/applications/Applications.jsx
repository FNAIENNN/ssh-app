import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FeedApplication from './FeedApplication';
import ChekkaApplication from './ChekkaApplication';

export default function Applications() {
  const navigate = useNavigate();
  const [stockingDate, setStockingDate] = useState(new Date().toISOString().slice(0, 10));
  const [numberOfDays, setNumberOfDays] = useState(7);
  const [kgPerDay, setKgPerDay] = useState('2.0');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Back Navigation to Vehicle Booking */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/app/seed/seed-stock')}
          className="btn-ghost text-xs font-bold flex items-center gap-1"
        >
          <span>←</span> Back to Vehicle Booking
        </button>
        <span className="text-xs font-bold text-text-muted">Step 4 of 4: Applications</span>
      </div>

      <FeedApplication
        stockingDate={stockingDate}
        setStockingDate={setStockingDate}
        numberOfDays={numberOfDays}
        setNumberOfDays={setNumberOfDays}
        kgPerDay={kgPerDay}
        setKgPerDay={setKgPerDay}
      />

      <ChekkaApplication
        stockingDate={stockingDate}
        numberOfDays={numberOfDays}
        kgPerDay={kgPerDay}
      />
    </div>
  );
}
