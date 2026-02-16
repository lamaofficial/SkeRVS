import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { type GraphData, type Node, type Link } from '../types';

interface GraphProps {
    data: GraphData;
    width: number;
    height: number;
    onNodeClick: (node: Node) => void;
    onNodeDoubleClick: (node: Node) => void;
    onBackgroundClick: () => void;
    colorScale: d3.ScaleOrdinal<string, string>;
    selectedNode: Node | null;
}

const Graph: React.FC<GraphProps> = ({ 
    data, width, height, 
    onNodeClick, onNodeDoubleClick, onBackgroundClick, 
    colorScale, selectedNode 
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const gRef = useRef<SVGGElement>(null);
    const initialRender = useRef(true);

    // Initial Layout & Render
    useEffect(() => {
        if (!data || !svgRef.current) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); 

        const g = svg.append("g");
        gRef.current = g.node();

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .extent([[0, 0], [width, height]])
            .scaleExtent([0.1, 8])
            .on("zoom", ({ transform }) => {
                g.attr("transform", transform.toString());
            });

        svg.call(zoom);

        svg.on("click", (event) => {
            if (event.target === svg.node()) {
                onBackgroundClick();
            }
        });

        const simulation = d3.forceSimulation<Node>(data.nodes)
            .force("link", d3.forceLink<Node, Link>(data.links).id((d) => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius((d: any) => (Math.sqrt(d.weight) * 50 + 5) + 5))
            .stop();

        // Run simulation synchronously
        for (let i = 0; i < 300; ++i) simulation.tick();

        // Draw Links
        const link = g.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(data.links)
            .join("line")
            .attr("class", "link")
            .attr("stroke-width", (d) => Math.sqrt(d.value || d.weight) * 0.5)
            .attr("x1", (d: any) => d.source.x)
            .attr("y1", (d: any) => d.source.y)
            .attr("x2", (d: any) => d.target.x)
            .attr("y2", (d: any) => d.target.y);

        // Draw Nodes
        const node = g.append("g")
            .selectAll("g")
            .data(data.nodes)
            .join("g")
            .attr("class", "node")
            .attr("transform", (d: any) => `translate(${d.x},${d.y})`)
            .call(d3.drag<any, Node>()
                .on("start", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                })
            );

        node.on("click", (event, d) => {
            event.stopPropagation();
            onNodeClick(d);
        });
        
        node.on("dblclick", (event, d) => {
             event.stopPropagation();
             onNodeDoubleClick(d);
        });

        node.append("circle")
            .attr("r", (d: any) => Math.sqrt(d.weight) * 50 + 5)
            .attr("fill", (d) => colorScale(String(d.group)))
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5);

        node.append("text")
            .text((d) => d.id)
            .attr("x", (d: any) => (Math.sqrt(d.weight) * 50 + 5) + 2)
            .attr("y", 3)
            .style("font-size", "10px")
            .style("fill", "#333");
            
        node.append("title")
            .text((d) => `ID: ${d.id}\nWeight: ${d.weight.toFixed(4)}`);

        // Clean up
        return () => {
             simulation.stop();
        };

    }, [data, width, height, colorScale]); 

    // Handle Selection / Highlighting via React prop
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const node = svg.selectAll<SVGGElement, Node>(".node");
        const link = svg.selectAll<SVGLineElement, Link>(".link");

        // Clear previous highlights
        node.style("opacity", 1);
        node.select("circle").attr("stroke", "#fff").attr("stroke-width", 1.5);
        node.selectAll(".info-label").remove();
        link.style("opacity", 1).attr("stroke", "#999");

        if (!selectedNode) return;

        // Apply new highlights
        const d = selectedNode;
        const neighborIds = new Set<string>();
        neighborIds.add(d.id);
        
        // Find neighbors from data.links
        // Since data.links might have object refs or strings depending on d3 state
        // But simulation ran on data.links, so they are objects now
        data.links.forEach((l: any) => {
             if (l.source.id === d.id) neighborIds.add(l.target.id);
             if (l.target.id === d.id) neighborIds.add(l.source.id);
        });

        // Dim everything
        node.style("opacity", 0.1);
        link.style("opacity", 0.1);

        // Highlight connected links
        link.filter((l: any) => l.source.id === d.id || l.target.id === d.id)
            .style("opacity", 1)
            .attr("stroke", "#555");
        
        // Highlight neighbor nodes
        node.filter((n) => neighborIds.has(n.id))
            .style("opacity", 1);
            
        // Emphasize the selected node
        const targetNode = node.filter((n) => n.id === d.id);
        targetNode.style("opacity", 1);
        targetNode.select("circle")
            .attr("stroke", "#000")
            .attr("stroke-width", 3);
            
        // Add detailed labels below
        const infoText = targetNode.append("text")
            .attr("class", "info-label")
            .attr("x", 0)
            .attr("y", (d: any) => (Math.sqrt(d.weight) * 50 + 5) + 15)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("fill", "#000");

        infoText.append("tspan")
            .attr("x", 0)
            .attr("dy", "0em")
            .text(`关联节点: ${Math.max(0, neighborIds.size - 1)}`);
        
        // Group Name logic
        let groupName = "Unknown";
        if (d.groupName) groupName = d.groupName;
        else if (data.group_names) {
             groupName = data.group_names[d.group] || data.group_names[String(d.group)] || `Group ${d.group}`;
        }
        
        infoText.append("tspan")
            .attr("x", 0)
            .attr("dy", "1.2em")
            .text(`分组: ${groupName}`);

    }, [selectedNode, data]); 

    return (
        <svg ref={svgRef} width={width} height={height} style={{ width: '100%', height: '100%' }}>
        </svg>
    );

};

export default Graph;
