export class TimestreamQueryService {
  query(queryString: string): { rows: any[]; columnInfo: any[] } {
    // Return empty mock results — Timestream queries need real data ingestion
    return {
      columnInfo: [
        { Name: "measure_name", Type: { ScalarType: "VARCHAR" } },
        { Name: "time", Type: { ScalarType: "TIMESTAMP" } },
        { Name: "measure_value::double", Type: { ScalarType: "DOUBLE" } },
      ],
      rows: [],
    };
  }

  describeEndpoints(): { endpoints: { Address: string; CachePeriodInMinutes: number }[] } {
    return {
      endpoints: [{ Address: "localhost:4566", CachePeriodInMinutes: 1440 }],
    };
  }
}
