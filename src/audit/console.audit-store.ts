export class ConsoleAuditStore implements AuditStore {

    async append(event: AuditEvent): Promise<void> {
        console.log(JSON.stringify(event));
    }
}