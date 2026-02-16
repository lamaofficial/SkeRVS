import React from 'react';

interface ContextPanelProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    content: React.ReactNode;
}

const ContextPanel: React.FC<ContextPanelProps> = ({ isOpen, onClose, title, content }) => {
    return (
        <div className={`context-panel ${isOpen ? 'open' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>{title}</h3>
                <button 
                    onClick={onClose} 
                    style={{ width: 'auto', padding: '5px 10px', background: '#666', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                    ×
                </button>
            </div>
            <div className="context-content">
                {content}
            </div>
        </div>
    );
};

export default ContextPanel;
