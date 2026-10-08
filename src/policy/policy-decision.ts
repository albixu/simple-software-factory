export type PolicyDecision = 
    |   {
            allowed: true;
        }
    |   {
            allowed: false;
            reason: string;
        };