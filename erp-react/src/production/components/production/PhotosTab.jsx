import React, { useRef, useState } from 'react';
import Icon from '../icons/Icon';
import { formatDate } from '../../utils/format';
import './PhotosTab.css';

/**
 * Photo gallery — browser file input, previews via object URLs.
 * Photos exist only in frontend state for this step.
 */
export default function PhotosTab() {
  const [photos, setPhotos] = useState([]);
  const inputRef = useRef(null);

  const handleFiles = (e) => {
    const incoming = Array.from(e.target.files)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        url: URL.createObjectURL(file),
        date: new Date().toISOString(),
      }));
    if (incoming.length) setPhotos((prev) => [...incoming, ...prev]);
    e.target.value = '';
  };

  const removePhoto = (id) => setPhotos((prev) => prev.filter((photo) => photo.id !== id));

  return (
    <div>
      <div className="photos-toolbar">
        <span className="photo-count">{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current.click()}>
          <Icon name="upload" size={15} /> Upload Photos
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
      </div>

      {photos.length === 0 ? (
        <p className="tab-empty">No photos uploaded yet. Use "Upload Photos" to add production photos.</p>
      ) : (
        <div className="photo-grid">
          {photos.map((photo) => (
            <figure key={photo.id} className="photo-item">
              <img src={photo.url} alt={photo.name} />
              <figcaption className="photo-caption">
                <span className="photo-name">{photo.name}</span>
                <span className="photo-date">{formatDate(photo.date.slice(0, 10))}</span>
              </figcaption>
              <button
                type="button"
                className="photo-delete"
                aria-label={`Delete ${photo.name}`}
                onClick={() => removePhoto(photo.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
