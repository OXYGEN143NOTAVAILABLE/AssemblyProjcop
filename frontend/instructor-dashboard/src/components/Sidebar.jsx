import { useEffect, useRef, useState } from 'react';
import { Home, Clock, Folder, ChevronDown, MoreHorizontal } from 'lucide-react';

export function Sidebar({
  classes,
  activeView,
  selectedClassId,
  onNavigate,
  onSelectClass,
  instructorName,
  onUpdateInstructorName,
}) {
  const [classroomsOpen, setClassroomsOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(instructorName);
  const footerRef = useRef(null);

  useEffect(() => {
    if (!userMenuOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };

    const handleMouseDown = (e) => {
      if (footerRef.current && !footerRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [userMenuOpen]);

  const handleSaveName = (e) => {
    e.preventDefault();
    const trimmed = editingName.trim();
    if (trimmed) {
      onUpdateInstructorName(trimmed);
    }
    setUserMenuOpen(false);
  };

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">
            AP
          </div>
          <div className="brand-name">
            <div>Assembly</div>
            <div>PC</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item ${activeView === 'home' ? 'is-active' : ''}`}
            onClick={() => onNavigate('home')}
          >
            <Home size={16} aria-hidden="true" />
            <span>Home</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeView === 'schedules' ? 'is-active' : ''}`}
            onClick={() => onNavigate('schedules')}
          >
            <Clock size={16} aria-hidden="true" />
            <span>Schedules</span>
          </button>

          <div>
            <button
              type="button"
              className="nav-item"
              aria-expanded={classroomsOpen}
              onClick={() => setClassroomsOpen((prev) => !prev)}
            >
              <Folder size={16} aria-hidden="true" />
              <span>Classrooms</span>
              <ChevronDown
                size={15}
                aria-hidden="true"
                className={`nav-item-chevron ${classroomsOpen ? 'is-open' : 'is-closed'}`}
              />
            </button>

            {classroomsOpen && (
              <ul className="nav-sublist">
                {classes.length === 0 ? (
                  <li
                    className="nav-subitem"
                    style={{ cursor: 'default', color: '#64748b' }}
                  >
                    No Classrooms
                  </li>
                ) : (
                  classes.map((cls) => (
                    <li key={cls.id}>
                      <button
                        type="button"
                        className={`nav-subitem ${
                          activeView === 'class-detail' && selectedClassId === cls.id
                            ? 'is-active'
                            : ''
                        }`}
                        onClick={() => onSelectClass(cls.id)}
                      >
                        <span className="nav-dot" aria-hidden="true" />
                        <span>{cls.name}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </nav>
      </div>

      <div className="sidebar-footer" ref={footerRef}>
        <div className="user-avatar" aria-hidden="true" />
        <span className="user-label">{instructorName}</span>
        <button
          type="button"
          className="user-menu-btn"
          aria-label="User profile options"
          aria-expanded={userMenuOpen}
          onClick={() => {
            setEditingName(instructorName);
            setUserMenuOpen((prev) => !prev);
          }}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>

        {userMenuOpen && (
          <form className="user-popover" onSubmit={handleSaveName}>
            <label className="form-label" htmlFor="instructor-name-input">
              Instructor Name
            </label>
            <input
              id="instructor-name-input"
              className="form-input"
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setUserMenuOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
            <div className="user-popover-divider">
              <a href="/logout" className="btn-secondary user-popover-logout">
                Log out
              </a>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}
