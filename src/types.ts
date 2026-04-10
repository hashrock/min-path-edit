export interface Point {
  x: number;
  y: number;
}

export interface Segment extends Point {
  out: Point | null;
  in: Point | null;
  mirror: boolean;
}

export interface Path {
  points: Segment[];
  closed: boolean;
}
