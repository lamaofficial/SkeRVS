import React from 'react';
import { MousePointer2 } from 'lucide-react';
import '../styles.css';

interface ToolbarProps {
    activeTool: string;
    onToolChange: (tool: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ activeTool, onToolChange }) => {
    return (
        <div className="toolbar">
            <button 
                className={`toolbar-btn ${activeTool === 'select' ? 'active' : ''}`}
                onClick={() => onToolChange('select')}
                title="选择模式 (Select Mode)"
            >
                <MousePointer2 size={24} />
            </button>
        </div>
    );
};

export default Toolbar;
