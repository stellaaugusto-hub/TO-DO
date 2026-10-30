import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ICONS } from '../lib/icons.js';
import { COLORS } from '../lib/colors.js';

/** Grille d'icônes + pastilles de couleur. */
export function IconColorPicker({ icon, color, onChange, onClose, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const esc = (e) => e.key === 'Escape' && onClose();
    setTimeout(() => window.addEventListener('mousedown', close), 0);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  return (
    <motion.div
      ref={ref}
      className="picker"
      style={style}
      onClick={(e) => e.stopPropagation()}
      initial={{ opacity: 0, scale: 0.92, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -8 }}
      transition={{ type: 'spring', stiffness: 480, damping: 30 }}
    >
      <h6>Logo</h6>
      <div className="icons">
        {Object.entries(ICONS).map(([key, I], i) => (
          <motion.button key={key} className={key === icon ? 'on' : ''} onClick={() => onChange({ icon: key })} title={key} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.006 }}>
            <I size={17} />
          </motion.button>
        ))}
      </div>
      <h6>Couleur</h6>
      <div className="colors">
        {Object.entries(COLORS).map(([key, hex]) => (
          <button key={key} className={key === color ? 'on' : ''} style={{ background: hex }} onClick={() => onChange({ color: key })} title={key} />
        ))}
      </div>
    </motion.div>
  );
}
