export type Session = {
  id: string;
  subjectId: string;
  secs: number;
  note: string;
  ts: number;
};

export type Task = {
  id: string;
  label: string;
  color: string;
  weeklyGoalSecs?: number;
};
