import { useState, useEffect, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import Sidebar from './components/Sidebar';
import ContextPanel from './components/ContextPanel';
import Legend from './components/Legend';
import Graph from './components/Graph';
import Toolbar from './components/Toolbar';
import { type GraphData, type Node } from './types';
import './styles.css';

function App() {
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [filteredData, setFilteredData] = useState<GraphData | null>(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ percent: 0, message: '' });
    const [nodeCount, setNodeCount] = useState(200);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [contextOpen, setContextOpen] = useState(false);
    const [contextContent, setContextContent] = useState<React.ReactNode>(null);
    const [contextTitle, setContextTitle] = useState('');
    const [stats, setStats] = useState<any>(null);
    const [activeTool, setActiveTool] = useState('select');
    const [dimensions, setDimensions] = useState({ width: window.innerWidth - 300 - 50, height: window.innerHeight }); // Adjust for sidebar + toolbar

    // Handle Resize
    useEffect(() => {
        const handleResize = () => {
            setDimensions({ width: window.innerWidth - 300 - 50, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Color Scale
    const colorScale = useMemo(() => d3.scaleOrdinal(d3.schemeCategory10), []);

    const filterData = useCallback((data: GraphData | null, limit: number) => {
        if (!data) return null;
        // Correctly handle clone to avoid mutation issues if re-filtering same object repeatedly
        // But for D3 simulation stability, we might want to preserve object references if they already have x/y?
        // Actually, if limit changes, we want simulation to adjust.
        // A fresh clone ensures clear state.
        const nodes = data.nodes.slice(0, limit).map(n => ({...n})); 
        const nodeIds = new Set(nodes.map(n => n.id));
        const links = data.links.filter(l => {
             const s = (typeof l.source === 'object') ? (l.source as any).id : l.source;
             const t = (typeof l.target === 'object') ? (l.target as any).id : l.target;
             return nodeIds.has(s) && nodeIds.has(t);
        }).map(l => ({...l})); // Clone links too

        return {
            ...data,
            nodes,
            links
        };
    }, []);

    const handleUpload = async (file: File, useAiNaming: boolean) => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            setProgress({ percent: 10, message: '上传中...' });
            const uploadRes = await fetch('/upload', { method: 'POST', body: formData });
            if (!uploadRes.ok) throw new Error("Upload failed");
            const uploadData = await uploadRes.json();
            
            setProgress({ percent: 20, message: '请求分析任务...' });
            const analyzeRes = await fetch(`/analyze?filename=${uploadData.filename}&use_ai_naming=${useAiNaming}`, { method: 'POST' });
            if (!analyzeRes.ok) throw new Error("Analysis failed to start");
            const taskData = await analyzeRes.json();
            const taskId = taskData.task_id;
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Use window.location.host since Vite proxy handles WS at /ws path?
            // If dev server, location.host is localhost:5173. 
            // We need to connect to backend's WS port 8000 if not proxied perfectly.
            // Vite proxy for /ws points to ws://localhost:8000.
            // So connecting to `ws://${window.location.host}/ws/task/${taskId}` should work if proxy is set up correctly for WS.
            
            // Let's try direct connection to 8000 if dev server
            // Actually, best is relative URL wrapped in WS protocol
            // But browser WS construction usually requires absolute URL.
            // `ws://${window.location.host}/ws/...` goes to vite dev server.
            // Vite needs to proxy `^/ws` to `ws://localhost:8000`.
            // Our config has that. So it should work.
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws/task/${taskId}`);
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.status === 'error') {
                     ws.close();
                     alert("任务失败: " + data.message);
                     setLoading(false);
                     return;
                }
                
                setProgress({ percent: data.progress, message: data.message });
                
                if (data.status === 'completed') {
                    setGraphData(data.result);
                    if (data.result.meta && data.result.meta.stats) {
                        setStats(data.result.meta.stats);
                    }
                    const initialCount = Math.min(200, data.result.nodes.length);
                    setNodeCount(initialCount);
                    setFilteredData(filterData(data.result, initialCount));
                    setLoading(false);
                    ws.close();
                }
            };
            
            ws.onerror = () => {
                setLoading(false);
                alert("WebSocket connection error");
            };

        } catch (e: any) {
            console.error(e);
            alert(e.message);
            setLoading(false);
        }
    };

    const handleNodeRangeChange = (val: number) => {
        setNodeCount(val);
        setFilteredData(filterData(graphData, val));
    };

    // Combined Click & Context Handler
    const handleNodeClick = useCallback(async (node: Node) => {
        setSelectedNode(node);
        
        // Open Context Panel
        setContextOpen(true);
        setContextTitle(`节点详情: ${node.id}`);
        setContextContent(<div style={{textAlign:'center', padding: '20px'}}>加载中...</div>);

        try {
            const filename = graphData?.meta?.file || (graphData as any)?.file; // fallback
            if (!filename) {
                setContextContent(<div>No filename associated with data.</div>);
                return;
            }
            
            const res = await fetch('/context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, keyword: node.id })
            });
            const d = await res.json();
            
            // Try different ways to access group name
            let groupName = 'Unknown';
            if (node.groupName) groupName = node.groupName;
            else if (graphData?.group_names) {
                groupName = graphData.group_names[node.group] || graphData.group_names[String(node.group)] || `Group ${node.group}`;
            }

            // Highlight matches
            const sentences = d.sentences.map((s: string, i: number) => (
                <div key={i} className="context-item">
                   <div dangerouslySetInnerHTML={{ 
                       __html: s.replace(new RegExp(node.id, 'g'), `<span style="background:#f9f2f4; color:#d9534f; font-weight:bold;">${node.id}</span>`)
                   }} />
                </div>
            ));

            setContextContent(
                <div>
                     <p><strong>分组:</strong> {groupName}</p>
                     <p><strong>重要性:</strong> {node.weight.toFixed(4)}</p>
                     <p><strong>相关段落:</strong> {d.sentences.length} 条</p>
                     <hr style={{border:'0', borderTop:'1px solid #eee', margin:'10px 0'}}/>
                     {sentences}
                </div>
            );
        } catch (e) {
            console.error(e);
            setContextContent(<div style={{padding:'20px', color:'red'}}>Error loading context</div>);
        }
    }, [graphData]);

    const handleNodeDoubleClick = useCallback((node: Node) => {
        // Now mostly redundant or can be used for something else. 
        // User asked to merge functionality into single click.
    }, []);

    const handleDeleteNode = useCallback(() => {
        if (!selectedNode || !graphData) return;
        
        // Remove from main graphData
        const newNodes = graphData.nodes.filter(n => n.id !== selectedNode.id);
        const newLinks = graphData.links.filter(l => {
            const s = (typeof l.source === 'object') ? (l.source as any).id : l.source;
            const t = (typeof l.target === 'object') ? (l.target as any).id : l.target;
            return s !== selectedNode.id && t !== selectedNode.id;
        });
        
        const newGraphData = {
            ...graphData,
            nodes: newNodes,
            links: newLinks
        };

        setGraphData(newGraphData);
        setFilteredData(filterData(newGraphData, nodeCount));
        setSelectedNode(null);
        setContextOpen(false);
    }, [selectedNode, graphData, nodeCount, filterData]);

    const handleBackgroundClick = useCallback(() => {
        setSelectedNode(null);
        setContextOpen(false);
    }, []);

    const handleImport = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                setGraphData(json);
                setStats(json.meta?.stats);
                const initialCount = Math.min(200, json.nodes.length);
                setNodeCount(initialCount);
                setFilteredData(filterData(json, initialCount));
            } catch (err) {
                alert("Import failed");
            }
        };
        reader.readAsText(file);
    };

    const handleExport = (type: string) => {
         // Export should use the current state (potentially with deleted nodes)
         // If user wants to export the *current view*, use filteredData.
         // If user wants to export the *whole dataset* (minus deletions), use graphData.
         // Usually export implies "what I see + hidden data", so graphData is better, 
         // but consistent with current deletions.
         const dataToExport = graphData || filteredData;
         
         if (!dataToExport && type !== 'excel') return;
         
         if (type === 'json') {
             const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
             const downloadAnchorNode = document.createElement('a');
             downloadAnchorNode.setAttribute("href", dataStr);
             downloadAnchorNode.setAttribute("download", `analysis_result_${Date.now()}.json`);
             document.body.appendChild(downloadAnchorNode); 
             downloadAnchorNode.click();
             downloadAnchorNode.remove();
         } else {
             alert("Only JSON export is implemented for now.");
         }
    };

    return (
        <div className="container" style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <Toolbar activeTool={activeTool} onToolChange={setActiveTool} />
            
            <Sidebar 
                onUpload={handleUpload}
                onImport={handleImport}
                onExport={handleExport}
                onNodeRangeChange={handleNodeRangeChange}
                nodeCount={nodeCount}
                maxNodes={graphData?.nodes.length || 0}
                loading={loading}
                progress={progress}
                hasData={!!graphData}
                stats={stats}
            />
            
            <div className="main" style={{ flex: 1, position: 'relative' }}>
                 {/* Delete Button Overlay */}
                 {selectedNode && (
                     <div style={{
                         position: 'absolute',
                         top: '20px',
                         left: '50%',
                         transform: 'translateX(-50%)',
                         zIndex: 1000,
                         background: 'white',
                         padding: '10px 20px',
                         borderRadius: '8px',
                         boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                         display: 'flex',
                         gap: '10px',
                         alignItems: 'center'
                     }}>
                         <span>选中节点: <strong>{selectedNode.id}</strong></span>
                         <button 
                            onClick={handleDeleteNode}
                            style={{
                                background: '#e74c3c',
                                color: 'white',
                                border: 'none',
                                padding: '5px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                         >
                             删除节点
                         </button>
                     </div>
                 )}

                 {filteredData && (
                     <>
                        <Graph 
                            data={filteredData}
                            width={dimensions.width}
                            height={dimensions.height}
                            onNodeClick={handleNodeClick}
                            onNodeDoubleClick={handleNodeDoubleClick} // Keeping pass but handler is empty
                            onBackgroundClick={handleBackgroundClick}
                            colorScale={colorScale}
                            selectedNode={selectedNode}
                        />
                        <Legend 
                            groups={filteredData.group_names || (graphData?.group_names as any)} 
                            colorScale={colorScale} 
                        />
                     </>
                 )}
                 <ContextPanel 
                     isOpen={contextOpen} 
                     onClose={() => setContextOpen(false)} 
                     title={contextTitle} 
                     content={contextContent} 
                 />
            </div>
        </div>
    );
}

export default App;
