// Base event class
export abstract class NotificationEvent {
  constructor(
    public readonly userId: string,
    public readonly timestamp: Date = new Date(),
  ) {}
}

// Environment Events
export class EnvironmentCreatedEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
  ) {
    super(userId);
  }
}

export class EnvironmentActiveEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
    public readonly overlayNetworkId: string,
  ) {
    super(userId);
  }
}

export class EnvironmentErrorEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
    public readonly errorMessage: string,
    public readonly operation: 'creation' | 'deletion' | 'public_config',
  ) {
    super(userId);
  }
}

export class EnvironmentDeletedEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
  ) {
    super(userId);
  }
}

export class EnvironmentMadePublicEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
  ) {
    super(userId);
  }
}

// Deployment Events
export class DeploymentSuccessEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly deploymentId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
    public readonly image: string,
    public readonly tag: string,
    public readonly isGitDeployment: boolean,
    public readonly virtualHost?: string,
    public readonly virtualPort?: number,
  ) {
    super(userId);
  }
}

export class DeploymentFailedEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly deploymentId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
    public readonly image: string,
    public readonly errorMessage: string,
    public readonly isGitDeployment: boolean,
  ) {
    super(userId);
  }
}

export class DeploymentStartedEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly deploymentId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
    public readonly image: string,
    public readonly tag: string,
    public readonly isGitDeployment: boolean,
  ) {
    super(userId);
  }
}

export class DeploymentStoppedEvent extends NotificationEvent {
  constructor(
    userId: string,
    public readonly deploymentId: string,
    public readonly environmentId: string,
    public readonly environmentName: string,
    public readonly image: string,
    public readonly tag: string,
  ) {
    super(userId);
  }
}
