// Database types for Supabase
// These should match your Supabase schema

export type HuntQuestion = {
  question: string;
  answer: string;
  options?: string[];
  category: string;
  difficulty: "easy" | "medium" | "hard";
};

export type Hunt = {
  id: string;
  title: string;
  description: string;
  prize: string;
  prize_pool: number;
  number_of_winners: number;
  target_spend_per_user: number;
  start_date: string;
  end_date: string;
  entry_requirement: number;
  image_url: string | null;
  number_of_hunts: number;
  keys_to_win: number;
  hunt_location?: string | null;
  region_name?: string | null;
  waypoints?: Array<{ label?: string; lng: number; lat: number }> | null;
  pricing_config: {
    refuelCost: number;
    restCost: number;
    rejuvenateCost: number;
    maintenanceCost: { bicycle: number; motorbike: number; car: number };
    rentCost: { bicycle: number; motorbike: number; car: number; bus: number };
    busFare: number;
    planeFare: number;
  };
  question_categories: string[];
  difficulty_distribution: { easy: number; medium: number; hard: number };
  briefing: string;
  questions: HuntQuestion[];
  status: "draft" | "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type PlayerPosition = {
  id: string;
  hunt_id: string;
  player_id: string;
  player_name: string;
  lng: number;
  lat: number;
  keys: number;
  current_question?: string | null;
  answering_question?: boolean;
  question_deadline_at?: string | null;
  updated_at: string;
};

export type AdminProfile = {
  id: string;
  user_id: string;
  created_at: string;
};
