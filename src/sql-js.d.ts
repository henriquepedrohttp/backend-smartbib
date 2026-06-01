declare module "sql.js" {
  export interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface Statement {
    run(params?: any[]): void;
    bind(params?: any[]): boolean;
    step(): boolean;
    free(): void;
  }

  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }
}
