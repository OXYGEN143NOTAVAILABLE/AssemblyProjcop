import { Plus } from 'lucide-react';
import { ScheduleStatusBadge } from './ActivitySchedulesPanel';

export function ClassCard({ cls, onSelectClass, onQuickAddActivity }) {
  const pct =
    cls.totalStudents > 0
      ? Math.min(100, Math.round((cls.submitted / cls.totalStudents) * 100))
      : 0;
  const showAvgGrade =
    cls.metricType === 'avgGrade' ||
    (cls.activityStatus === 'finished' && cls.avgGrade && cls.avgGrade !== '—');

  return (
    <article className="class-card" onClick={() => onSelectClass(cls.id)}>
      <div className="class-card-header">
        <div>
          <h3 className="class-card-title">
            <button
              type="button"
              className="class-card-main-btn"
              aria-label={`Open ${cls.name} details`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectClass(cls.id);
              }}
            >
              {cls.displayName}
            </button>
          </h3>
          <span className="class-card-subtitle">
            {cls.totalStudents}{' '}
            {cls.totalStudents === 1 ? 'student' : 'students'} · {pct}% submitted
          </span>
        </div>

        <div className="class-card-header-actions">
          {cls.activityStatus && cls.activityStatus !== 'none' && (
            <ScheduleStatusBadge status={cls.activityStatus} />
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={`Schedule activity for ${cls.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onQuickAddActivity(cls.id);
            }}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="progress-group">
        <span className="progress-label">
          {cls.submitted} of {cls.totalStudents} submitted
        </span>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={cls.submitted}
          aria-valuemin={0}
          aria-valuemax={cls.totalStudents}
          aria-label={`${cls.submitted} of ${cls.totalStudents} submitted`}
        >
          <div className="progress-fill" style={{ inlineSize: `${pct}%` }} />
        </div>
      </div>

      <div className="class-card-metrics">
        <div className="metric-item">
          <span className="metric-label">AT-RISK</span>
          <span
            className={`metric-value ${
              cls.atRisk > 0 ? 'metric-value--danger' : ''
            }`}
          >
            {cls.atRisk}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">NEXT ACTIVITY</span>
          <span className="metric-value" title={cls.nextActivity}>
            {cls.nextActivity}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">
            {showAvgGrade ? 'AVG GRADE' : 'NUMBER OF STUDENTS'}
          </span>
          <span className="metric-value">
            {showAvgGrade ? cls.avgGrade : cls.totalStudents}
          </span>
        </div>
      </div>
    </article>
  );
}
