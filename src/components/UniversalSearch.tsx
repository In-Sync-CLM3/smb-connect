import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';

interface MemberResult {
  type: 'member';
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  avatar: string | null;
  company_name: string | null;
}

interface AssociationResult {
  type: 'association';
  id: string;
  name: string;
  logo: string | null;
  industry: string | null;
}

type SearchResult = MemberResult | AssociationResult;

export const UniversalSearch = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const search = async () => {
      if (!searchTerm.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        // Search members and associations in parallel
        const [membersResult, associationsResult] = await Promise.all([
          searchMembers(searchTerm),
          searchAssociations(searchTerm),
        ]);

        setResults([...associationsResult, ...membersResult]);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm]);

  const handleSelect = (result: SearchResult) => {
    setIsFocused(false);
    setSearchTerm('');
    setResults([]);
    if (result.type === 'association') {
      navigate(`/member/associations/${result.id}`);
    } else {
      navigate(`/profile/${result.user_id}`);
    }
  };

  const showDropdown = isFocused && searchTerm.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search members & associations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsFocused(true)}
          className="pl-9 h-9"
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 overflow-hidden">
          {loading ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-72 overflow-y-auto">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                >
                  {result.type === 'association' ? (
                    <>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={result.logo || undefined} />
                        <AvatarFallback>
                          <Building2 className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{result.name}</p>
                        {result.industry && (
                          <p className="text-xs text-muted-foreground truncate">{result.industry}</p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
                        Association
                      </span>
                    </>
                  ) : (
                    <>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={result.avatar || undefined} />
                        <AvatarFallback>
                          {result.first_name[0]}
                          {result.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {result.first_name} {result.last_name}
                        </p>
                        {result.company_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {result.company_name}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
                        Member
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

async function searchMembers(term: string): Promise<MemberResult[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  // Split search term into words to support full name search (e.g. "John Smith")
  const words = trimmed.split(/\s+/).filter(Boolean);

  let query = supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar');

  if (words.length === 1) {
    query = query.or(`first_name.ilike.%${words[0]}%,last_name.ilike.%${words[0]}%`);
  } else {
    // For multi-word search, match first word against first_name AND last word against last_name,
    // OR the full term against either column
    const firstWord = words[0];
    const lastWord = words[words.length - 1];
    query = query.or(
      `first_name.ilike.%${firstWord}%,last_name.ilike.%${lastWord}%,first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`
    );
  }

  const { data: profiles, error } = await query.limit(6);

  if (error || !profiles) return [];

  const results = await Promise.all(
    profiles.map(async (profile) => {
      const { data: memberData } = await supabase
        .from('members')
        .select('id, company:companies!members_company_id_fkey(name)')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle();

      return {
        type: 'member' as const,
        id: memberData?.id || profile.id,
        user_id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        avatar: profile.avatar,
        company_name: (memberData?.company as any)?.name || null,
      };
    })
  );

  return results.filter((r) => r.id);
}

async function searchAssociations(term: string): Promise<AssociationResult[]> {
  const { data, error } = await supabase
    .from('associations')
    .select('id, name, logo, industry')
    .eq('is_active', true)
    .ilike('name', `%${term}%`)
    .limit(4);

  if (error || !data) return [];

  return data.map((a) => ({
    type: 'association' as const,
    id: a.id,
    name: a.name,
    logo: a.logo,
    industry: a.industry,
  }));
}
