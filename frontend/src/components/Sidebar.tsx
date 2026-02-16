import React, { useRef } from 'react';

interface SidebarProps {
    onUpload: (file: File, useAiNaming: boolean) => void;
    onImport: (file: File) => void;
    onExport: (type: 'json' | 'excel' | 'sqlite') => void;
    onNodeRangeChange: (val: number) => void;
    nodeCount: number;
    maxNodes: number;
    loading: boolean;
    progress: { percent: number; message: string };
    hasData: boolean;
    stats: { nodes: number; links: number; duration: string; groups: number } | null;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    onUpload, onImport, onExport, onNodeRangeChange, 
    nodeCount, maxNodes, loading, progress, hasData, stats 
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const aiNamingRef = useRef<HTMLInputElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = () => {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            alert("请先选择文件");
            return;
        }
        const useAi = aiNamingRef.current?.checked || false;
        onUpload(file, useAi);
    };

    const handleImportClick = () => {
         const file = importInputRef.current?.files?.[0];
         if (!file) {
             alert("请选择要导入的文件");
             return;
         }
         onImport(file);
    };

    return (
        <div className="sidebar">
            <h1>智能图谱分析</h1>
            
            <div className="control-group">
                <input type="file" ref={fileInputRef} accept=".txt" title="选择文本文件进行分析" />
                <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" id="useAiNaming" ref={aiNamingRef} style={{ width: 'auto', marginRight: '6px' }} />
                    <label htmlFor="useAiNaming" style={{ fontSize: '0.9em', color: '#555', cursor: 'pointer' }}>启用AI为分组命名</label>
                </div>
                <button onClick={handleUploadClick} disabled={loading}>
                    {loading ? '分析中...' : '开始分析'}
                </button>
            </div>

            <div className="control-group" style={{ paddingBottom: '15px', borderBottom: '1px solid #eee', marginBottom: '15px' }}>
                <p style={{ margin: '5px 0', fontSize: '0.9em', color: '#666' }}>或导入历史结果：</p>
                <input type="file" ref={importInputRef} accept=".json, .xlsx, .db, .sqlite, .sqlite3" title="选择JSON、Excel或SQLite文件导入历史结果" />
                <button onClick={handleImportClick} style={{ backgroundColor: '#17a2b8' }} disabled={loading}>
                    导入 (JSON/Excel/SQLite)
                </button>
            </div>

            {hasData && (
                <>
                    <div className="control-group">
                        <button onClick={() => onExport('json')} style={{ backgroundColor: '#28a745', marginBottom: '5px' }}>导出分析结果 (JSON)</button>
                        <button onClick={() => onExport('excel')} style={{ backgroundColor: '#218838', marginBottom: '5px' }}>导出分析结果 (Excel .xlsx)</button>
                        <button onClick={() => onExport('sqlite')} style={{ backgroundColor: '#6f42c1' }}>导出分析结果 (SQLite .db)</button>
                        <p style={{ fontSize: '0.8em', color: '#888', marginTop: '2px' }}>* 推荐 .xlsx 格式，体积更小且打开速度更快</p>
                    </div>
                    
                    <div className="control-group" style={{ borderTop: '1px solid #eee', paddingTop: '15px' }}>
                         <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#555' }}>
                            显示节点数: <span>{nodeCount}</span>
                        </label>
                        <input 
                            type="range" 
                            min="20" 
                            max={maxNodes} 
                            value={nodeCount} 
                            step="10" 
                            onChange={(e) => onNodeRangeChange(Number(e.target.value))} 
                            aria-label="调整节点数量"
                        />
                        <p style={{ fontSize: '0.8rem', color: '#999', marginTop: '5px' }}>调整后自动重新布局</p>
                    </div>
                </>
            )}
            
            {loading && (
                <div style={{ textAlign: 'center', margin: '20px 0' }}>
                    <p>{progress.message}</p>
                    <div className="progress-bar-container">
                        <div className="progress-bar" style={{ width: `${progress.percent}%` }}></div>
                    </div>
                </div>
            )}

            <div id="stats">
                {stats ? (
                    <>
                        <p><strong>文件:</strong> {stats.duration ? '分析完成' : '已加载'}</p>
                        <p><strong>耗时:</strong> {stats.duration || '-'}</p>
                        <p><strong>节点数:</strong> {stats.nodes}</p>
                        <p><strong>连边数:</strong> {stats.links}</p>
                        <p><strong>分组数:</strong> {stats.groups}</p>
                    </>
                ) : (
                    <p>等待数据...</p>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
