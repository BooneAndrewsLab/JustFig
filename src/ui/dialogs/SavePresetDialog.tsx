/** Save the selection as a named preset (note 22), kept in this browser and shown under My presets. */
import { useState } from 'react';

import { MAX_NAME } from '@/io/storage';

import { savePreset } from '../state/session';
import { Dialog } from './Dialog';

export function SavePresetDialog({
  suggested,
  count,
  onClose,
}: {
  suggested: string;
  count: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(suggested);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Save as preset" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void savePreset(name).then((ok) => {
            setBusy(false);
            if (ok) onClose();
          });
        }}
      >
        <p className="note">
          Keeps the {count === 1 ? 'selected object' : `${String(count)} selected objects`} in this
          browser, with any icons and pictures they use. Place it again from Templates…, under My
          presets.
        </p>
        <div className="row">
          <label htmlFor="preset-name">Preset name</label>
          <input
            id="preset-name"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || name.trim() === ''}>
            Save preset
          </button>
        </div>
      </form>
    </Dialog>
  );
}
