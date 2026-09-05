export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
}

export interface FormConfig {
  id: string;
  title: string;
  description: string;
  fullNameLabel: string;
  tasks: TaskItem[];
  updatedAt: string;
}

export interface UserResponse {
  sessionKey: string;
  fullName: string;
  answers: Record<string, string>; // taskId -> answer
  createdAt: string;
  updatedAt: string;
  isValid: boolean; // false if invalidated by admin
}

export interface AdminStatus {
  hasAdmin: boolean;
  isAdminAuthenticated: boolean;
  isFirstAdminAvailable: boolean;
  sessionToken?: string;
}

export interface ServerConfig {
  basePath: string;
  port: number;
}
