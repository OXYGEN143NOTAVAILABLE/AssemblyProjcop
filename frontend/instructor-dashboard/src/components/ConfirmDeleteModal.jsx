import { ModalDialog } from './ModalDialog';

export function ConfirmDeleteModal({ schedule, onClose, onConfirm }) {
  return (
    <ModalDialog
      isOpen={Boolean(schedule)}
      onClose={onClose}
      title="Delete Scheduled Activity"
    >
      <div className="modal-body">
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          Are you sure you want to delete{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {schedule?.activityName}
          </strong>{' '}
          from{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {schedule?.className}
          </strong>
          ?
        </p>
      </div>

      <div className="modal-footer">
        <button
          type="button"
          className="btn-secondary"
          autoFocus
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            if (schedule) {
              onConfirm(schedule.id);
            }
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </ModalDialog>
  );
}
