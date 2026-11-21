import { CheckCircle2, ChevronRight, Lock, Unlock } from 'lucide-react';
import { computeActivitySubmissionStats } from '../domain/dashboardLogic';

export function ScheduleStatusBadge({ status, isLocked }) {
  const resolvedStatus = status || (isLocked ? 'scheduled' : 'active');

  if (resolvedStatus === 'finished') {
    return (
      <span className="schedule-status-badge schedule-status-badge--finished">
        <CheckCircle2 size={11} aria-hidden="true" />
        <span>Finished</span>
      </span>
    );
  }

  if (resolvedStatus === 'active') {
    return (
      <span className="schedule-status-badge schedule-status-badge--unlocked">
        <Unlock size={11} aria-hidden="true" />
        <span>Active</span>
      </span>
    );
  }

  if (resolvedStatus === 'closed') {
    return (
      <span className="schedule-status-badge schedule-status-badge--closed">
        <Lock size={11} aria-hidden="true" />
        <span>Closed</span>
      </span>
    );
  }

  return (
    <span className="schedule-status-badge schedule-status-badge--locked">
      <Lock size={11} aria-hidden="true" />
      <span>Scheduled</span>
    </span>
  );
}

export function ActivitySchedulesPanel({
  schedules,
  classes = [],
  upcomingCount,
  onViewAll,
  onScheduleClick,
  onSelectSchedule,
  hasClasses,
}) {
  const resolvedUpcomingCount =
    typeof upcomingCount === 'number'
      ? upcomingCount
      : schedules.filter((s) => s.status === 'scheduled' || s.status === 'active')
          .length;

  return (
    <aside className="panel" aria-label="Activity Schedules">
      <div className="panel-header">
        <h2 className="panel-title">
          <span>Activity Schedules</span>
          <span className="panel-count-pill">{resolvedUpcomingCount} upcoming</span>
        </h2>
        <button
          type="button"
          className="panel-link-btn"
          onClick={onViewAll}
        >
          <span>View All</span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="schedules-list">
        {schedules.length === 0 ? (
          <div className="schedules-empty">
            <p className="empty-state-text">No Schedules</p>
            <button
              type="button"
              className="btn-secondary"
              disabled={!hasClasses}
              onClick={onScheduleClick}
            >
              + Schedule Activity
            </button>
          </div>
        ) : (
          schedules.map((item) => {
            const targetClass = classes.find((c) => c.id === item.classId);
            const students = targetClass?.students || [];
            const totalStudents = targetClass?.totalStudents ?? 0;
            const { submittedCount } = computeActivitySubmissionStats(
              item,
              students
            );

            return (
              <button
                key={item.id}
                type="button"
                className="schedule-row schedule-row--clickable schedule-row-btn"
                onClick={() => onSelectSchedule?.(item.id)}
              >
                <div className="schedule-date">
                  <span className="schedule-day">{item.day}</span>
                  <span className="schedule-num">{item.dateNum}</span>
                </div>
                <div className="schedule-info">
                  <div className="schedule-activity-row">
                    <span className="schedule-class">{item.className}</span>
                    <ScheduleStatusBadge
                      status={item.status}
                      isLocked={item.isLocked}
                    />
                  </div>
                  <span className="schedule-activity">{item.activityName}</span>
                  <span className="schedule-due">
                    {item.timeValue ? `${item.timeValue} · ` : ''}
                    {item.dueDateLabel ? `Due ${item.dueDateLabel} · ` : ''}
                    {submittedCount} of {totalStudents} submitted
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
