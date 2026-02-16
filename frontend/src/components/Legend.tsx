import React from 'react';
import * as d3 from 'd3';

interface LegendProps {
    groups: Record<string, string>;
    colorScale: d3.ScaleOrdinal<string, string>;
}

const Legend: React.FC<LegendProps> = ({ groups, colorScale }) => {
    if (!groups) return null;
    
    return (
        <div id="graphLegend">
            <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9em' }}>分组标识</div>
            {Object.entries(groups).map(([id, name]) => (
                <div key={id} className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: colorScale(id) }}></div>
                    <span>{name}</span>
                </div>
            ))}
        </div>
    );
};

export default Legend;
