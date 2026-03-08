import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import ProjectSwitcher from './ProjectSwitcher.jsx';

const VERSION = '2.15.0';

export default function Sidebar({
  nav,
  navItems,
  onNav,
  collapsed,
  onToggleCollapse,
  activeProject,
  projects,
  onSwitchProject,
}) {
  const { tokens: t } = useTheme();

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: collapsed ? 52 : 190,
        height: '100vh',
        background: t.surface,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        zIndex: 20,
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <button
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          padding: collapsed ? '14px 12px' : '14px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          userSelect: 'none',
          background: 'none',
          border: 'none',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: `linear-gradient(135deg, ${t.plan}, ${t.build}, ${t.run})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            fontFamily: FONTS.mono,
          }}
        >
          P
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, fontFamily: FONTS.sans }}>
              PBR
            </div>
            <div style={{ fontSize: 9, color: t.textDim, fontFamily: FONTS.mono }}>
              v{VERSION}
            </div>
          </div>
        )}
      </button>

      {/* Project Switcher */}
      <ProjectSwitcher
        collapsed={collapsed}
        activeProject={activeProject}
        projects={projects}
        onSwitch={onSwitchProject}
      />

      {/* Nav Items */}
      <nav
        aria-label="Main navigation"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
          padding: 8,
        }}
      >
        {navItems.map((item) => {
          const active = nav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? item.label : undefined}
              style={{
                padding: collapsed ? '8px 0' : '8px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background: active ? t.surfaceAlt : 'transparent',
                color: active ? t.accent : t.textMuted,
                fontWeight: active ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'background 0.15s, color 0.15s',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                font: 'inherit',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = t.surfaceAlt;
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 16, width: 16, textAlign: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
              {!collapsed && (
                <span style={{ fontFamily: FONTS.sans, fontSize: 12 }}>{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div
          style={{
            padding: 12,
            borderTop: `1px solid ${t.border}`,
          }}
        >
          <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: t.textDim }}>
            {projects.find((p) => p.id === activeProject)?.repo || 'No project'}
          </div>
        </div>
      )}
    </div>
  );
}
