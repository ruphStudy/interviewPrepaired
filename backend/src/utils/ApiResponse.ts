export class ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  metadata?: any;

  constructor(statusCode: number, message: string, data?: any, metadata?: any) {
    this.success = statusCode < 400;
    this.message = message;
    if (data !== undefined) {
      this.data = data;
    }
    if (metadata) {
      this.metadata = metadata;
    }
  }
}

export const successResponse = (
  message: string,
  data?: any,
  metadata?: any
): ApiResponse => {
  return new ApiResponse(200, message, data, metadata);
};

export const createdResponse = (
  message: string,
  data?: any,
  metadata?: any
): ApiResponse => {
  return new ApiResponse(201, message, data, metadata);
};
