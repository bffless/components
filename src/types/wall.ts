export interface WallPost {
  id: string;
  name: string;
  message: string;
  photoUrl?: string;
  createdAt: string;
}

export interface WallScene {
  id: string;
  scene_name: string;
  image_url: string;
  post_count: number;
  poster_name?: string;
  createdAt: string;
}

export interface SceneBackground {
  id: string;
  name: string;
  image_url: string;
  description: string;
}
