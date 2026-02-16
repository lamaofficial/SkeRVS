export interface Node {
    id: string;
    weight: number;
    group: number;
    groupName?: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    size?: number;
}

export interface Link {
    source: string | Node;
    target: string | Node;
    weight: number;
    value?: number;
}

export interface GraphData {
    nodes: Node[];
    links: Link[];
    meta?: any;
    group_names?: Record<string, string>;
}
