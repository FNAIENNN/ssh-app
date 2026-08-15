import { NavLink } from 'react-router-dom';

export default function AppBottomNav() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div 
        className="mx-4 mb-3 px-2 py-2 flex items-center justify-around rounded-full bg-white border border-slate-200"
        style={{
          boxShadow: '0 10px 24px rgba(15, 52, 96, 0.12), 0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <NavItem to="/app/seed" icon="🌱" label="Seed" color="#1976D2" />
        <NavItem to="/app/trail-netting" icon="🥢" label="Netting" color="#0FA37A" />
        <NavItem to="/app/harvest" icon="🌾" label="Harvest" color="#E6A817" />
      </div>
    </div>
  );
}

function NavItem({ to, icon, label, color }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex items-center justify-center transition-all duration-300 h-12 ${
          isActive ? 'flex-1 px-3 mx-1 rounded-full' : 'w-16'
        }`
      }
      style={({ isActive }) => ({
        backgroundColor: isActive ? `${color}1A` : 'transparent', // 10% opacity
      })}
    >
      {({ isActive }) => (
        <div className="flex items-center justify-center gap-2">
          {/* Icon Container */}
          <div
            className="flex items-center justify-center rounded-[14px] transition-all duration-300"
            style={{
              width: isActive ? 32 : 30,
              height: isActive ? 32 : 30,
              backgroundColor: isActive ? color : `${color}14`, // 8% opacity when inactive
              color: isActive ? 'white' : color,
            }}
          >
            <span style={{ fontSize: isActive ? '16px' : '15px' }}>{icon}</span>
          </div>

          {/* Label (only visible when active) */}
          <div
            className={`overflow-hidden transition-all duration-300 ${
              isActive ? 'max-w-[100px] opacity-100 ml-1' : 'max-w-0 opacity-0 ml-0'
            }`}
          >
            <span
              className="font-extrabold whitespace-nowrap text-[11px] tracking-wide"
              style={{ color }}
            >
              {label}
            </span>
          </div>
        </div>
      )}
    </NavLink>
  );
}
