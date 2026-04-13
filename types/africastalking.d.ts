// Type declarations for the africastalking npm package (no @types package exists)
declare module "africastalking" {
  interface ATOptions {
    apiKey: string;
    username: string;
  }

  interface SMSSendOptions {
    to: string[];
    message: string;
    from?: string;
    enqueue?: boolean;
  }

  interface SMSRecipient {
    statusCode: number;
    number: string;
    status: string;
    cost: string;
    messageId: string;
  }

  interface SMSSendResult {
    SMSMessageData: {
      Message: string;
      Recipients: SMSRecipient[];
    };
  }

  interface SMSClient {
    send(options: SMSSendOptions): Promise<SMSSendResult>;
  }

  interface ApplicationData {
    UserData: { balance: string };
  }

  interface ApplicationClient {
    fetchApplicationData(): Promise<ApplicationData>;
  }

  interface ATInstance {
    SMS: SMSClient;
    APPLICATION: ApplicationClient;
  }

  function AfricasTalking(options: ATOptions): ATInstance;
  export = AfricasTalking;
}
