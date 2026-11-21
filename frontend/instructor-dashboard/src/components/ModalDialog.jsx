import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function ModalDialog({ isOpen, onClose, title, children }) {
  const dialogRef = useRef(null);
  const mouseDownOnBackdropRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="apc-dialog"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        mouseDownOnBackdropRef.current = e.target === dialogRef.current;
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && mouseDownOnBackdropRef.current) {
          dialogRef.current.close();
        }
        mouseDownOnBackdropRef.current = false;
      }}
    >
      <div className="modal-header">
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close dialog"
          onClick={() => dialogRef.current?.close()}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
