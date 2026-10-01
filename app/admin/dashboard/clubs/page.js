'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RefreshCw, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';
import EmptyState from '@/components/empty-state';
import { format } from 'date-fns';

export default function AdminClubsPage() {
  const [clubs, setClubs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const PAGE_SIZE = 25;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(0), [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), search: debouncedSearch });
      const res = await fetch(`/api/admin/clubs?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load clubs');
      const data = await res.json();
      setClubs(data.clubs || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Club Management</h1>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="club-search" className="sr-only">Search clubs</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            id="club-search"
            className="pl-9"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon" onClick={load} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error ? (
        <ErrorState title="Could not load clubs" description={error} onRetry={load} />
      ) : clubs.length === 0 && !loading ? (
        <EmptyState icon={Building2} title="No clubs found" description="No clubs match your search." />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <TableRow key={i}>
                      <TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : clubs.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-6 font-medium">{c.name}</TableCell>
                    <TableCell>{c.member_count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{c.description || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(c.created_at), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between px-6 py-3 border-t text-sm text-muted-foreground">
            <span>{total} club{total !== 1 ? 's' : ''}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="flex items-center px-2">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
