export interface MySQLConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
}

export interface MySQLResult {
    success: boolean;
    data?: any[];
    error?: string;
}

export interface MySQLExecuteResult {
    affectedRows?: number;
    insertId?: number;
    warningStatus?: number;
    data?: any[];
    error?: string;
}

export interface MySQLTable {
    name: string;
    columns: MySQLColumn[];
}

export interface MySQLColumn {
    name: string;
    type: string;
    nullable: boolean;
    key?: string;
    default?: string;
    extra?: string;
}
