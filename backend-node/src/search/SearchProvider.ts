import { Client } from '@opensearch-project/opensearch';
import { Resume } from '../models/Resume';
import { prisma } from '../server';

export interface SearchProvider {
  searchCandidates(organizationId: string, query: string, limit: number): Promise<any[]>;
  searchAuditLogs(organizationId: string, query: string, limit: number): Promise<any[]>;
}

export class MongoAtlasSearchProvider implements SearchProvider {
  async searchCandidates(organizationId: string, query: string, limit: number): Promise<any[]> {
    // Basic regex fallback if Atlas Search ($search) is not fully indexed locally
    return await Resume.find({
      organizationId,
      $or: [
        { candidateName: { $regex: query, $options: 'i' } },
        { candidateEmail: { $regex: query, $options: 'i' } },
        { 'parsedData.jobTitle': { $regex: query, $options: 'i' } },
        { 'parsedData.skills': { $regex: query, $options: 'i' } }
      ]
    }).limit(limit);
  }

  async searchAuditLogs(organizationId: string, query: string, limit: number): Promise<any[]> {
    // Basic ILIKE search in PostgreSQL for AuditLogs
    return await prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: [
          { action: { contains: query, mode: 'insensitive' } },
          { resource: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: limit
    });
  }
}

export class OpenSearchProvider implements SearchProvider {
  private client: Client;

  constructor(nodeUrl: string) {
    this.client = new Client({ node: nodeUrl });
  }

  async searchCandidates(organizationId: string, query: string, limit: number): Promise<any[]> {
    try {
      const response = await this.client.search({
        index: 'candidates',
        body: {
          query: {
            bool: {
              must: [{ match: { _all: query } }],
              filter: [{ term: { organizationId } }]
            }
          },
          size: limit
        }
      });
      return response.body.hits.hits.map((hit: any) => hit._source);
    } catch (error) {
      console.error("OpenSearch Candidate Search failed:", error);
      return [];
    }
  }

  async searchAuditLogs(organizationId: string, query: string, limit: number): Promise<any[]> {
    try {
      const response = await this.client.search({
        index: 'auditlogs',
        body: {
          query: {
            bool: {
              must: [{ match: { _all: query } }],
              filter: [{ term: { organizationId } }]
            }
          },
          size: limit
        }
      });
      return response.body.hits.hits.map((hit: any) => hit._source);
    } catch (error) {
      console.error("OpenSearch Audit Search failed:", error);
      return [];
    }
  }
}

// Factory
export const getSearchProvider = (): SearchProvider => {
  if (process.env.OPENSEARCH_URL) {
    return new OpenSearchProvider(process.env.OPENSEARCH_URL);
  }
  return new MongoAtlasSearchProvider();
};
