
// Global data storage
let globalGraphData = null;
let rawTextContent = null; // Stores the full text content for client-side search
let currentSearchState = { keyword: '', results: [], page: 1, pageSize: 5 };

// D3 Graph Logic
const svg = d3.select("#graph");
let width = document.querySelector(".main").clientWidth;
let height = document.querySelector(".main").clientHeight;

// Use a static simulation calculation first
const simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(d => d.size + 5))
    .stop(); // Don't run automatically

function renderGraph(data) {
    globalGraphData = data;
    svg.selectAll("*").remove(); // Clear previous
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Define reset function closure
    let resetHighlight;

    const nodes = data.nodes.map(d => ({...d, size: Math.sqrt(d.weight) * 50 + 5 }));
    const links = data.links.map(d => ({...d, value: d.weight }));
    
    // Pre-calculate layout (static)
    simulation.nodes(nodes);
    simulation.force("link").links(links);
    simulation.alpha(1); // Reset alpha
    
    // Run simulation synchronously for 300 ticks to stabilize
    // This prevents the "jumping around" effect
    for (let i = 0; i < 300; ++i) simulation.tick();
    
    const g = svg.append("g");
    
    // Zoom support
    const zoom = d3.zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.1, 8])
        .on("zoom", ({transform}) => g.attr("transform", transform));
    
    svg.call(zoom);

    // Links (Static positions)
    const link = g.append("g")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "link")
        .attr("stroke-width", d => Math.sqrt(d.value) * 0.5)
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
        .attr("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();
            loadSharedContext(d.source.id, d.target.id);
        });

    link.append("title")
        .text(d => `Weight: ${d.value.toFixed(2)}\nClick to see shared context`);

    // Nodes (Static positions)
    const node = g.append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .call(drag(simulation)) // Drag still works if needed, but simulation won't auto-run
        .on("dblclick", (event, d) => { // User requested Double Click
            event.stopPropagation(); // Prevent bg click
            loadContext(d.id);
            highlightNeighbors(d);
        });
        
    node.append("circle")
        .attr("r", d => d.size)
        // Use community group color if available
        .attr("fill", d => d.group !== undefined ? colorScale(d.group) : d3.schemeCategory10[Math.floor(Math.random() * 10)]) 
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);
        
    node.append("text")
        .text(d => d.id)
        .attr("x", d => d.size + 2)
        .attr("y", 3)
        .style("font-size", "10px")
        .style("fill", "#333");
        
    node.append("title")
        .text(d => `ID: ${d.id}\nWeight: ${d.weight.toFixed(4)}`);

    // Highlight Logic
    function highlightNeighbors(d) {
        // Reset first
        resetHighlight();

        const neighborIds = new Set();
        const connectedLinks = links.filter(l => {
            const isConnected = l.source.id === d.id || l.target.id === d.id;
            if (isConnected) {
                neighborIds.add(l.source.id);
                neighborIds.add(l.target.id);
            }
            return isConnected;
        });

        // Dim everything
        node.style("opacity", 0.1);
        link.style("opacity", 0.1);

        // Highlight connected links
        link.filter(l => l.source.id === d.id || l.target.id === d.id)
            .style("opacity", 1)
            .attr("stroke", "#555")
            .attr("stroke-width", l => Math.sqrt(l.value) * 1.5);

        // Highlight neighbor nodes
        node.filter(n => neighborIds.has(n.id))
            .style("opacity", 1);
        
        // Emphasize the clicked node
        const targetNode = node.filter(n => n.id === d.id);
        targetNode.select("circle")
            .attr("stroke", "#000")
            .attr("stroke-width", 3);

        // Add detailed labels below
        const infoText = targetNode.append("text")
            .attr("class", "info-label")
            .attr("x", 0)
            .attr("y", d.size + 15)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("fill", "#000");

        infoText.append("tspan")
            .attr("x", 0)
            .attr("dy", "0em")
            .text(`关联节点: ${Math.max(0, neighborIds.size - 1)}`);
        
        // Add Group Name
        let groupName = "Unknown";
        if (d.groupName) {
            groupName = d.groupName;
        } else if (globalGraphData.group_names) {
            groupName = globalGraphData.group_names[d.group] || `Group ${d.group}`;
        } else {
             groupName = `Group ${d.group}`;
        }
        
        infoText.append("tspan")
            .attr("x", 0)
            .attr("dy", "1.2em")
            .text(`分组: ${groupName}`);

        infoText.append("tspan")
            .attr("x", 0)
            .attr("dy", "1.2em")
            .text(`重要性: ${d.weight.toFixed(2)}`);
    }

    resetHighlight = function() {
        // Reset styles
        node.style("opacity", 1);
        node.select("circle")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5);
        node.selectAll(".info-label").remove();
        
        link.style("opacity", 1)
            .attr("stroke", "#999")
            .attr("stroke-width", d => Math.sqrt(d.value) * 0.5);
    };

    // No tick handler needed because we pre-calculated positions
    
    // Background click to close & reset
    svg.on("click", () => {
        closeContext();
        resetHighlight();
    });

    // --- Graph Legend ---
    const legendContainer = document.getElementById("graphLegend");
    if (legendContainer) {
        legendContainer.innerHTML = "";
        const groups = [...new Set(nodes.map(d => d.group))].filter(g => g !== undefined).sort((a,b) => a - b);
        
        if (groups.length > 0) {
            legendContainer.style.display = 'block';
            
            const title = document.createElement('div');
            title.style.fontWeight = 'bold';
            title.style.marginBottom = '5px';
            title.style.fontSize = '0.9em';
            title.innerText = "分组标识";
            legendContainer.appendChild(title);

            groups.forEach(g => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                
                const box = document.createElement('div');
                box.className = 'legend-color';
                box.style.backgroundColor = colorScale(g);
                
                const label = document.createElement('span');
                
                // Debug logging
                if (g === groups[0]) {
                    console.log("First group ID:", g, typeof g);
                    console.log("Available group names:", data.group_names);
                }

                // Use generated names if available - check both number and string keys
                let groupName = null;
                if (data.group_names) {
                    groupName = data.group_names[g] || data.group_names[String(g)];
                }

                if (groupName) {
                    label.innerText = groupName;
                } else {
                    label.innerText = `Group ${g}`;
                }
                
                item.appendChild(box);
                item.appendChild(label);
                legendContainer.appendChild(item);
            });
        } else {
            legendContainer.style.display = 'none';
        }
    }
}

function exportData() {
    if (!globalGraphData) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(globalGraphData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `analysis_result_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function exportDataToExcel() {
    if (!globalGraphData) return;
    
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: false }] };
    
    // 为每个 sheet 指定最小化样式
    const wsOpts = {
    cellStyles: false,      // 禁用单元格样式
    dateNF: 'yyyy-mm-dd',  // 统一日期格式
    sheetStubs: false      // 禁用占位符
    };

    // 1. Nodes Sheet
    // Create a copy to avoid mutating global data
    const nodesArr = globalGraphData.nodes.map(n => ({
        id: n.id,
        weight: Number(n.weight.toFixed(2)),
        // Add any other properties here if they exist
    }));
    const nodesWS = XLSX.utils.json_to_sheet(nodesArr, wsOpts);
    XLSX.utils.book_append_sheet(wb, nodesWS, "Nodes");

    // 2. Links Sheet
    // Helper to get ID string whether string or object
    const getId = (n) => (typeof n === 'object' && n.id) ? n.id : n;
    
    const linksArr = globalGraphData.links.map(l => ({
        source: getId(l.source),
        target: getId(l.target),
        weight: Number(l.weight.toFixed(2))
    }));
    const linksWS = XLSX.utils.json_to_sheet(linksArr, wsOpts);
    XLSX.utils.book_append_sheet(wb, linksWS, "Links");

    // 3. Meta Sheet
    if (globalGraphData.meta) {
        const metaArr = [
            { key: "filename", value: globalGraphData.meta.file },
            { key: "duration", value: globalGraphData.meta.duration },
            { key: "total_nodes", value: globalGraphData.meta.stats ? globalGraphData.meta.stats.nodes : 0 },
            { key: "total_links", value: globalGraphData.meta.stats ? globalGraphData.meta.stats.links : 0 }
        ];
        const metaWS = XLSX.utils.json_to_sheet(metaArr);
        XLSX.utils.book_append_sheet(wb, metaWS, "Meta");
    }

    // Optimization: Use XLSB format for smaller file size (Binary Excel)
    XLSX.writeFile(wb, `analysis_result_${Date.now()}.xlsx`, { bookType: 'xlsx', compression: true });
}

async function loadSqlJsLib() {
        if (window.SQL) return window.SQL;
        const config = {
        // Locate the wasm file. We use the same CDN version.
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${filename}`
        };
        // Ensure we call the library's init function, not our wrapper (if names collided)
        // The library exposes 'initSqlJs' globally.
        if (typeof window.initSqlJs !== 'function') {
            throw new Error("sql.js library not loaded correctly.");
        }
        window.SQL = await window.initSqlJs(config);
        return window.SQL;
}

async function exportDataToSQLite() {
    if (!globalGraphData) return;
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "生成中...";
    btn.disabled = true;

    try {
        const SQL = await loadSqlJsLib();
        const db = new SQL.Database();

        // Generate numeric IDs for efficient storage
        // Map: Node Label (string) -> Numeric ID (int)
        const nodeMap = new Map();
        globalGraphData.nodes.forEach((n, i) => {
            nodeMap.set(n.id, i + 1);
        });

        // Create Tables
        // Schema optimization: separate ID and Text
        db.run("CREATE TABLE nodes (id INTEGER PRIMARY KEY, label TEXT, weight REAL);");
        db.run("CREATE TABLE links (source INTEGER, target INTEGER, weight REAL);");
        db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);");

        // Insert Nodes
        db.run("BEGIN TRANSACTION");
        const nodesStmt = db.prepare("INSERT INTO nodes VALUES (?, ?, ?)");
        globalGraphData.nodes.forEach(n => {
            nodesStmt.run([nodeMap.get(n.id), n.id, n.weight]);
        });
        nodesStmt.free();
        db.run("COMMIT");

        // Insert Links
        db.run("BEGIN TRANSACTION");
        const linksStmt = db.prepare("INSERT INTO links VALUES (?, ?, ?)");
        // Helper to get Label string whether string or object (D3 converts to object)
        const getLabel = (n) => (typeof n === 'object' && n.id) ? n.id : n;
        
        globalGraphData.links.forEach(l => {
            const sourceLabel = getLabel(l.source);
            const targetLabel = getLabel(l.target);
            const sId = nodeMap.get(sourceLabel);
            const tId = nodeMap.get(targetLabel);
            
            if (sId && tId) {
                    linksStmt.run([sId, tId, l.weight]);
            }
        });
        linksStmt.free();
        db.run("COMMIT");

        // Insert Meta
        if (globalGraphData.meta) {
            const metaStmt = db.prepare("INSERT INTO meta VALUES (?, ?)");
            metaStmt.run(["filename", globalGraphData.meta.file]);
            metaStmt.run(["duration", globalGraphData.meta.duration]);
            if (globalGraphData.meta.stats) {
                metaStmt.run(["total_nodes", globalGraphData.meta.stats.nodes.toString()]);
                metaStmt.run(["total_links", globalGraphData.meta.stats.links.toString()]);
            }
            metaStmt.free();
        }

        // Export
        const data = db.export();
        // Avoid using Blob constructor directly with huge typed arrays if needed, but usually it's fine.
        // The issue is likely transaction management or specific sql.js behavior.
        
        const buffer = new Blob([data], { type: 'application/x-sqlite3' });
        
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.href = URL.createObjectURL(buffer);
        downloadAnchorNode.download = `analysis_result_${Date.now()}.db`;
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        db.close();

    } catch (e) {
        console.error(e);
        alert("SQLite 导出失败: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function importAndVisualize() {
    const fileInput = document.getElementById('importInput');
    if (fileInput.files.length === 0) {
        alert("请选择文件");
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();

    // Shared logic to render result
    const processResult = (result) => {
            if (!result.nodes || !result.links) {
            throw new Error("无效的数据格式: 缺少 nodes 或 links");
        }
        
        // Update global state
        globalGraphData = result;
        // Restore context filename if available, otherwise user uploaded filename
        window.currentFile = (result.meta && result.meta.file) ? result.meta.file : file.name; 
        
        // Setup slider
        const slider = document.getElementById('nodeRange');
        const maxNodes = result.nodes.length;
        slider.max = maxNodes;
        slider.value = Math.min(200, maxNodes);
        updateNodeCount(slider.value);
        
        document.getElementById('displaySettings').style.display = 'block';
        document.getElementById('exportGroup').style.display = 'block';
        
        // Stats
        if (result.meta && result.meta.stats) {
                document.getElementById('stats').innerHTML = `
                <p>文档: ${result.meta.file}</p>
                <p>耗时: ${result.meta.duration || 'N/A'}</p>
                <p>节点: ${result.meta.stats.nodes} | 连线: ${result.meta.stats.links}</p>
            `;
        } else {
            document.getElementById('stats').innerHTML = `<p>已导入: ${file.name}<br>节点: ${result.nodes.length} | 连线: ${result.links.length}</p>`;
        }

        // Render
        applyNodeFilter(slider.value);
        alert("导入成功！");
    };
    
    // Support .db, .sqlite, .sqlite3
    if (file.name.match(/\.(db|sqlite|sqlite3)$/i)) {
        reader.onload = async function(e) {
            try {
                const Uints = new Uint8Array(e.target.result);
                const SQL = await loadSqlJsLib();
                const db = new SQL.Database(Uints);

                // Read Nodes, handle both old (id=text) and new (id=int, label=text) schemas
                let nodes = [];
                let idToLabelMap = new Map(); // For reconstructing links if they use numeric IDs

                try {
                        // Check if schema has 'label' column
                    const schemaRes = db.exec("PRAGMA table_info(nodes)");
                    const columns = schemaRes[0].values.map(v => v[1]);
                    const hasLabel = columns.includes('label');

                    const nodesRes = db.exec("SELECT * FROM nodes");
                    if (nodesRes.length > 0) {
                            const cols = nodesRes[0].columns;
                            const vals = nodesRes[0].values;
                            
                            vals.forEach(row => {
                                let rowObj = {};
                                cols.forEach((col, i) => rowObj[col] = row[i]);
                                
                                if (hasLabel) {
                                    // New schema: id is int, label is text
                                    nodes.push({ id: rowObj.label, weight: rowObj.weight });
                                    idToLabelMap.set(rowObj.id, rowObj.label);
                                } else {
                                    // Old schema: id is text
                                    nodes.push({ id: rowObj.id, weight: rowObj.weight });
                                    idToLabelMap.set(rowObj.id, rowObj.id); // Identity map
                                }
                            });
                    }
                } catch (err) { throw new Error("读取节点表失败: " + err.message); }

                // Read Links
                let links = [];
                try {
                    const linksRes = db.exec("SELECT * FROM links");
                    if (linksRes.length > 0) {
                            const vals = linksRes[0].values; // [source, target, weight] commonly
                            const cols = linksRes[0].columns;
                            
                            vals.forEach(row => {
                                let l = {};
                                cols.forEach((col, i) => l[col] = row[i]);
                                
                                // Resolve IDs to Labels
                                const sourceLabel = idToLabelMap.get(l.source);
                                const targetLabel = idToLabelMap.get(l.target);
                                
                                if (sourceLabel && targetLabel) {
                                links.push({
                                    source: sourceLabel,
                                    target: targetLabel,
                                    weight: l.weight
                                });
                                }
                            });
                    }
                } catch (err) { throw new Error("读取连线表失败: " + err.message); }

                // Read Meta
                let meta = { file: file.name, stats: { nodes: nodes.length, links: links.length } };
                try {
                    const metaRes = db.exec("SELECT * FROM meta");
                    if (metaRes.length > 0) {
                        const vals = metaRes[0].values;
                        const metaObj = {};
                        vals.forEach(row => metaObj[row[0]] = row[1]);
                        meta = {
                            file: metaObj.filename || file.name,
                            duration: metaObj.duration || 'N/A',
                            stats: {
                                nodes: parseInt(metaObj.total_nodes) || nodes.length,
                                links: parseInt(metaObj.total_links) || links.length
                            }
                        };
                    }
                } catch(ignore) { /* Meta table might not exist */ }

                db.close();
                processResult({ nodes, links, meta });

            } catch (err) {
                console.error(err);
                alert("SQLite 导入失败: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    } 
    // Support both .xlsx and .xlsb
    else if (file.name.match(/\.xls(x|b)$/i)) {
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                
                // Parse Nodes
                if (!workbook.Sheets["Nodes"]) throw new Error("缺少 'Nodes' Sheet");
                const rawNodes = XLSX.utils.sheet_to_json(workbook.Sheets["Nodes"]);
                
                // Detect Schema (Old vs New)
                // Old: {id: "text", weight: 1}
                // New: {id: 1, label: "text", weight: 1}
                const isNewSchema = rawNodes.length > 0 && ('label' in rawNodes[0]);
                
                const nodes = [];
                const idToLabelMap = new Map();
                
                rawNodes.forEach(row => {
                    if (isNewSchema) {
                        nodes.push({ id: row.label, weight: row.weight });
                        idToLabelMap.set(row.id, row.label);
                    } else {
                        nodes.push({ id: row.id, weight: row.weight });
                        idToLabelMap.set(row.id, row.id);
                    }
                });
                
                // Parse Links
                if (!workbook.Sheets["Links"]) throw new Error("缺少 'Links' Sheet");
                const rawLinks = XLSX.utils.sheet_to_json(workbook.Sheets["Links"]);
                const links = [];
                
                rawLinks.forEach(row => {
                        const sLabel = idToLabelMap.get(row.source);
                        const tLabel = idToLabelMap.get(row.target);
                        if (sLabel && tLabel) {
                            links.push({ source: sLabel, target: tLabel, weight: row.weight });
                        }
                });
                
                // Parse Meta (Optional)
                let meta = { file: file.name, stats: { nodes: nodes.length, links: links.length } };
                if (workbook.Sheets["Meta"]) {
                    const metaArr = XLSX.utils.sheet_to_json(workbook.Sheets["Meta"]);
                    const metaObj = {};
                    metaArr.forEach(item => metaObj[item.key] = item.value);
                    // Reconstruct meta object
                    meta = {
                        file: metaObj.filename || file.name,
                        duration: metaObj.duration || 'N/A',
                        stats: {
                            nodes: parseInt(metaObj.total_nodes) || nodes.length,
                            links: parseInt(metaObj.total_links) || links.length
                        }
                    };
                }

                processResult({ nodes, links, meta });

            } catch (err) {
                console.error(err);
                alert("Excel 导入失败: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        // Assume JSON
        reader.onload = function(e) {
            try {
                const result = JSON.parse(e.target.result);
                processResult(result);
            } catch (err) {
                console.error(err);
                alert("JSON 导入失败: " + err.message);
            }
        };
        reader.readAsText(file);
    }
}

function updateNodeCount(val) {
    document.getElementById('nodeCountVal').innerText = val;
}

function applyNodeFilter(val) {
    if (!globalGraphData) return;
    const limit = parseInt(val);
    
    // Slice top N nodes (assuming sorted by weight descending from backend, otherwise sort first)
    // Backend returns top K sorted by weight usually.
    const nodes = globalGraphData.nodes.slice(0, limit);
    const nodeIds = new Set(nodes.map(n => n.id));
    
    // Filter links
    const links = globalGraphData.links.filter(l => 
        (nodeIds.has(l.source) || nodeIds.has(l.source.id)) && // Check both string and object (D3 transforms)
        (nodeIds.has(l.target) || nodeIds.has(l.target.id))
    );
    
    console.log(`Filtering: ${nodes.length} nodes, ${links.length} links`);
    // Pass full context including group_names
    renderGraph({ 
        ...globalGraphData, 
        nodes, 
        links 
    });
}

// Context / Side Panel
// Function to load shared context between two keywords
async function loadSharedContext(source, target) {
    const contextPanel = document.getElementById("contextPanel");
    const title = document.getElementById("contextTitle");
    const content = document.getElementById("contextContent");
    
    contextPanel.classList.add("open");
    title.innerText = `关联: ${source} & ${target}`;
    content.innerHTML = `<div style="text-align:center; padding:20px; color:#666;">
        <p>查找共同段落...</p>
    </div>`;
    
    if (window.currentFile) {
        try {
            const res = await fetch('/context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: window.currentFile, keyword: [source, target] })
            });
            
            if (!res.ok) throw new Error("Fetch failed");
            const data = await res.json();
            
            if (data.sentences && data.sentences.length > 0) {
                 content.innerHTML = data.sentences.map(sent => {
                    // Highlight both keywords
                    let highlighted = sent;
                    highlighted = highlighted.split(source).join(`<span class="context-keyword">${source}</span>`);
                    highlighted = highlighted.split(target).join(`<span class="context-keyword">${target}</span>`);
                    return `<div class="context-item">${highlighted}</div>`;
                }).join("");
            } else {
                content.innerHTML = `<div style="text-align:center; padding:20px; color:#888;">
                    <p>未找到包含这两个词的共同段落。</p>
                    <p>它们可能通过其他词间接关联。</p>
                </div>`;
            }
        } catch (e) {
            console.error(e);
            content.innerText = "加载失败: " + e.message;
        }
    } else {
        content.innerText = "请先上传文件进行分析。";
    }
}

function loadContext(keyword) {
    const panel = document.getElementById('contextPanel');
    const content = document.getElementById('contextContent');
    const title = document.getElementById('contextTitle');
    
    panel.classList.add('open');
    title.innerText = `"${keyword}" 的上下文`;
    
    // Check if we have the raw text
    if (!rawTextContent) {
        content.innerHTML = `
            <div class="missing-file-alert">
                <p>启用上下文检索需要原始文档。</p>
                <p style="font-size:0.8em; color:#666;">您正在查阅历史记录，浏览器本地未保存原始内容。</p>
                <input type="file" id="contextFileInput" accept=".txt" onchange="loadContextFile(this, '${keyword}')" />
            </div>
        `;
        return;
    }

    // Perform Client-side Search
    performSearch(keyword);
}

function loadContextFile(input, keyword) {
    if (input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        rawTextContent = e.target.result;
        performSearch(keyword); // Retry search
    };
    reader.readAsText(file);
}

function performSearch(keyword) {
    const content = document.getElementById('contextContent');
    content.innerHTML = '<div class="spinner" style="border: 2px solid #f3f3f3; border-top: 2px solid #333; border-radius: 50%; width: 14px; height: 14px; animation: spin 1s linear infinite;"></div> 实时检索中...';

    // Simple sentence splitting (rough/fast)
    // Matches sequence of chars ending in typical punctuation
    const sentences = rawTextContent.match(/[^。！？.!?\r\n]+[。！？.!?\r\n]+/g) || [];
    
    // Filter
    const matches = sentences.filter(s => s.indexOf(keyword) !== -1);
    
    currentSearchState = {
        keyword: keyword,
        results: matches,
        page: 1,
        pageSize: 10
    };
    
    renderContextResults();
}

function renderContextResults() {
    const content = document.getElementById('contextContent');
    const { results, page, pageSize, keyword } = currentSearchState;
    
    if (results.length === 0) {
        content.innerHTML = `<p>文档中未找到 "${keyword}" 的相关句子。</p>`;
        return;
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = results.slice(start, end);
    
    const listHtml = pageItems.map(s => {
        // Highlight
        // Safety: escape keyword for regex
        const safeKey = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const highlighted = s.replace(new RegExp(safeKey, 'g'), `<span class="context-keyword">${keyword}</span>`);
        return `<div class="context-item">${highlighted}</div>`;
    }).join("");
    
    const totalPages = Math.ceil(results.length / pageSize);
    
    const controlsHtml = `
        <div class="context-page-controls">
            <button class="context-page-btn" onclick="changeContextPage(-1)" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <span style="font-size:0.9em; line-height: 24px;">${page} / ${totalPages} (共${results.length}条)</span>
            <button class="context-page-btn" onclick="changeContextPage(1)" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
        </div>
    `;
    
    content.innerHTML = listHtml + controlsHtml;
}

function changeContextPage(delta) {
    const newState = currentSearchState;
    const totalPages = Math.ceil(newState.results.length / newState.pageSize);
    const nextPage = newState.page + delta;
    
    if (nextPage >= 1 && nextPage <= totalPages) {
        currentSearchState.page = nextPage;
        renderContextResults();
    }
}

function closeContext() {
    document.getElementById('contextPanel').classList.remove('open');
}

// Drag interaction (Updated for standard D3 drag without simulation run)
function drag(simulation) {
    function dragstarted(event) {
        // No restart needed for static graph
        d3.select(this).raise();
    }
    
    function dragged(event, d) {
        d.x = event.x;
        d.y = event.y;
        d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
        
        // Update connected links
        svg.selectAll("line")
            .filter(l => l.source.id === d.id || l.target.id === d.id)
            .attr("x1", l => l.source.x)
            .attr("y1", l => l.source.y)
            .attr("x2", l => l.target.x)
            .attr("y2", l => l.target.y);
    }
    
    function dragended(event) {
        // Nothing complex
    }
    
    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

// API Interaction
async function uploadAndAnalyze() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert("请先选择文件");
        return;
    }
    
    const btn = document.getElementById('uploadBtn');
    const loading = document.getElementById('loading');
    const pBar = document.getElementById('progressBar');
    const pMsg = document.getElementById('loadingMsg');
    
    btn.disabled = true;
    loading.style.display = 'block';
    pBar.style.width = '0%';
    pMsg.innerText = "准备上传...";
    
    try {
        // 1. Upload
        const file = fileInput.files[0];
        // Read locally for search
        const reader = new FileReader();
        reader.onload = e => { rawTextContent = e.target.result; };
        reader.readAsText(file);

        const formData = new FormData();
        formData.append('file', file);
        
        const uploadRes = await fetch('/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error("Upload failed");
        const uploadData = await uploadRes.json();
        
        // Store filename for context lookups
        window.currentFile = uploadData.filename;

        // Get AI Naming option
        const useAiNaming = document.getElementById('useAiNaming').checked;

        // 2. Start Async Analysis
        pMsg.innerText = "请求分析任务...";
        const analyzeRes = await fetch(`/analyze?filename=${uploadData.filename}&use_ai_naming=${useAiNaming}`, { method: 'POST' });
        if (!analyzeRes.ok) throw new Error("Analysis failed to start");
        const taskData = await analyzeRes.json();
        const taskId = taskData.task_id;
        
        // 3. Connect WebSocket for Progress
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/task/${taskId}`);
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.status === 'error') {
                ws.close();
                alert("任务失败: " + data.message);
                resetUI();
                return;
            }
            
            // Update UI
            pBar.style.width = `${data.progress}%`;
            pMsg.innerText = `${data.message} (${data.progress}%)`;
            
            if (data.status === 'completed') {
                // 4. Render Result
                const result = data.result;
                globalGraphData = result;
                
                // Setup slider
                const slider = document.getElementById('nodeRange');
                const maxNodes = result.nodes.length;
                slider.max = maxNodes;
                slider.value = Math.min(200, maxNodes); // Default to 200
                updateNodeCount(slider.value);
                
                document.getElementById('displaySettings').style.display = 'block';
                document.getElementById('exportGroup').style.display = 'block';
                
                // Initial filter & render
                applyNodeFilter(slider.value);
                
                // Stats
                let modelStatus = "";
                if (result.meta && result.meta.model_used !== undefined) {
                     modelStatus = result.meta.model_used ? 
                        '<span style="color:green; font-weight:bold;">Word2Vec: 启用 (语义增强)</span>' : 
                        '<span style="color:orange;">Word2Vec: 未启用 (仅统计共现)</span>';
                } else {
                     modelStatus = '<span style="color:#999;">Word2Vec: 未知</span>';
                }

                document.getElementById('stats').innerHTML = `
                    <p>文档: ${result.meta.file}</p>
                    <p>耗时: ${result.meta.duration}</p>
                    <p>节点: ${result.meta.stats.nodes} | 连线: ${result.meta.stats.links}</p>
                    <p style="margin-top:5px; font-size:0.85em; border-top:1px solid #ccc; padding-top:5px;">${modelStatus}</p>
                `;
                
                ws.close();
                resetUI();
            }
        };
        
        ws.onclose = () => {
            console.log("WebSocket Disconnected");
        };

        ws.onerror = (e) => {
            console.error("WebSocket Error", e);
        };
        
    } catch (e) {
        console.error(e);
        alert("处理出错: " + e.message);
        resetUI();
    }
    
    function resetUI() {
        document.getElementById('uploadBtn').disabled = false;
        document.getElementById('loading').style.display = 'none';
    }
}