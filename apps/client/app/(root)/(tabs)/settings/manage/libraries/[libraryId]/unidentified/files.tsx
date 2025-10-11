import type { AppRouter } from '@/router/root';
import {
  BottomSheetFlatList,
  type BottomSheetModal as BottomSheetModalType,
  useBottomSheetModal,
} from '@gorhom/bottom-sheet';
import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  type GroupingState,
  type Row,
  type RowSelectionState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { inferRouterOutputs } from '@trpc/server';
import { schemas } from '@voel/schemas';
import { useSelector } from '@xstate/store/react';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { toast } from 'sonner-native';
import type * as z from 'zod';

import { floatingPlayerStore } from '~/components/floating-player';
import { BookCopy } from '~/components/icons/BookCopy';
import { Check } from '~/components/icons/Check';
import { ChevronDown } from '~/components/icons/ChevronDown';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { MicVocal } from '~/components/icons/MicVocal';
import { OctagonAlert } from '~/components/icons/OctagonAlert';
import { PenTool } from '~/components/icons/PenTool';
import { Timer } from '~/components/icons/Timer';
import { Image } from '~/components/image';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { AspectRatio } from '~/components/ui/aspect-ratio';
import { Badge } from '~/components/ui/badge';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button, ButtonWithLoading } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { useAppForm } from '~/components/ui/form';
import { Separator } from '~/components/ui/separator';
import { Text } from '~/components/ui/text';
import { Large, Muted } from '~/components/ui/typography';

import { useApiInstance } from '~/lib/stores/instance';
import { cn, formatDuration } from '~/lib/utils';

const humanReadableReasons = {
  METADATA_NO_ALBUM_TITLE: "No album title was found in file's metadata",
  METADATA_NO_ARTIST_NAME: "No artist name was found in file's metadata",
  METADATA_NO_ALBUM_TITLE_NO_ARTIST_NAME:
    "No album title and artist name was found in file's metadata",
  AUDIBLE_COULD_NOT_ID_BOOK: 'Book could not be identified',
  USER_DELETED_FROM_BOOK: 'File was previously part of a book but was deleted by the user',
};

const unidentifiedFilesColumns: ColumnDef<
  inferRouterOutputs<AppRouter>['v1']['library']['unidentified']['getFiles'][number]
>[] = [
  {
    id: 'directory',
    header: 'Directory',
    accessorFn: (row) => row.directory,
    enableGrouping: true,
  },
  {
    id: 'reason',
    header: 'Reason',
    accessorFn: (row) => (row.reason ? humanReadableReasons[row.reason] : 'No reason was provided'),
    enableGrouping: true,
  },
  {
    id: 'fileName',
    header: 'File Name',
    accessorFn: (row) => row.name,
    enableGrouping: true,
  },
  {
    id: 'disc',
    header: 'Disc',
    accessorFn: (row) => row.disc,
    enableGrouping: true,
  },
  {
    id: 'track',
    header: 'Track',
    accessorFn: (row) => row.track,
    enableGrouping: false,
  },
  {
    id: 'duration',
    header: 'Duration',
    accessorFn: (row) => formatDuration(row.durationMs),
    enableGrouping: false,
  },
];

function useFloatingPlayerAndButtonDodgingPaddingClass() {
  const isPlayerActive = useSelector(floatingPlayerStore, (state) => state.context.isPlayerActive);
  const isUpdatePending = useSelector(
    floatingPlayerStore,
    (state) => state.context.isUpdatePending
  );

  if (isPlayerActive && isUpdatePending) return 'pt-6 pb-52 px-6';
  if (isPlayerActive) return 'pt-6 pb-40 px-6';
  if (isUpdatePending) return 'pt-6 pb-32 px-6';
  return 'pt-6 pb-20 px-6';
}

export default function UnidentifiedFilesPage() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const idNum = parseInt(libraryId);

  const isPlayerActive = useSelector(floatingPlayerStore, (state) => state.context.isPlayerActive);
  const isUpdatePending = useSelector(
    floatingPlayerStore,
    (state) => state.context.isUpdatePending
  );

  const identifyFilesModalRef = useRef<BottomSheetModalType>(null);

  const apiInstance = useApiInstance();

  const { data, error, refetch, isFetching } = useQuery(
    apiInstance.v1.library.unidentified.getFiles.queryOptions({
      id: idNum,
    })
  );

  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data: data ?? [],
    columns: unidentifiedFilesColumns,
    initialState: {
      sorting: [
        { id: 'disc', desc: false },
        { id: 'track', desc: false },
      ],
    },
    state: { grouping, rowSelection, columnVisibility },
    getSortedRowModel: getSortedRowModel(),
    onGroupingChange: setGrouping,
    getGroupedRowModel: getGroupedRowModel(),
    enableRowSelection: true,
    enableSubRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => `${row.directory}/${row.name}`,
  });

  const tabBarHeight = useBottomTabBarHeight();

  return (
    <>
      <Stack.Screen options={{ title: 'Unidentified Files' }} />

      <FlashList
        data={table.getRowModel().rows}
        keyExtractor={(item) => item.id}
        contentContainerClassName={useFloatingPlayerAndButtonDodgingPaddingClass()}
        ListHeaderComponent={
          <>
            <TitleWithRefetch className="pt-4" refetch={refetch} isFetching={isFetching}>
              Unidentified Files
            </TitleWithRefetch>

            {data && data.length > 0 ? (
              <>
                <Text className="pt-2">Group By</Text>

                <ScrollView className="flex flex-row pb-2 pt-1" horizontal>
                  {table.getLeafHeaders().filter((header) => header.column.getCanGroup()).length >
                  0 ? (
                    table
                      .getLeafHeaders()
                      .filter((header) => header.column.getCanGroup())
                      .map((header, index) => (
                        <Button
                          key={header.id}
                          onPress={header.column.getToggleGroupingHandler()}
                          size="sm"
                          variant="outline"
                          className={cn(
                            'flex flex-row items-center justify-center gap-x-1',
                            index === 0 ? '' : 'ml-2'
                          )}>
                          {header.column.getGroupedIndex() >= 0 ? (
                            <Badge variant="secondary" className="mr-1 px-1.5 py-0">
                              <Text>{header.column.getGroupedIndex() + 1}</Text>
                            </Badge>
                          ) : null}
                          <Text>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </Text>
                        </Button>
                      ))
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      <Text>None of the visible columns can be grouped</Text>
                    </Button>
                  )}
                </ScrollView>

                <Text className="pt-2">Column Visibility</Text>

                <ScrollView className="flex flex-row pb-2 pt-1" horizontal>
                  {table
                    .getAllColumns()
                    .filter((column) => !column.getIsGrouped())
                    .sort((a, b) => {
                      // Sort so toggled on columns appear first, toggled off last
                      const aVisible = a.getIsVisible();
                      const bVisible = b.getIsVisible();
                      if (aVisible === bVisible) return 0;
                      return aVisible ? -1 : 1;
                    })
                    .map((column, index) => (
                      <Button
                        key={column.id}
                        onPress={column.getToggleVisibilityHandler()}
                        size="sm"
                        variant={column.getIsVisible() ? 'secondary' : 'outline'}
                        className={cn(
                          'flex flex-row items-center justify-center gap-x-1',
                          index === 0 ? '' : 'ml-2'
                        )}>
                        {column.getIsVisible() ? (
                          <Check className="text-secondary-foreground" size={16} />
                        ) : null}
                        <Text>
                          {typeof column.columnDef.header === 'string'
                            ? column.columnDef.header
                            : column.id}
                        </Text>
                      </Button>
                    ))}
                </ScrollView>
              </>
            ) : null}
          </>
        }
        renderItem={({ item: row }) => <RenderRow row={row} variant="FlashList" />}
        ListEmptyComponent={
          error ? (
            <Card className="mt-4">
              <CardContent className="pt-4">
                <Large>Error loading unidentified files</Large>
                <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => refetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          ) : data?.length === 0 ? (
            <View className="mt-4 flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-muted px-8 py-16">
              <Text className="text-center">No unidentified files found in this library</Text>
            </View>
          ) : (
            <View className="items-center justify-center p-12">
              <Spinner size={15} />
            </View>
          )
        }
        ListFooterComponent={
          <View style={{ paddingBottom: Platform.OS === 'ios' ? tabBarHeight : 0 }} />
        }
      />

      <View
        className="absolute w-full px-4"
        style={{
          bottom:
            (Platform.OS === 'ios' ? tabBarHeight : 0) +
            (isPlayerActive && isUpdatePending
              ? 126
              : isPlayerActive
                ? 75
                : isUpdatePending
                  ? 60
                  : 10),
        }}>
        {/* because disabled button uses a background color with transparency */}
        <View className="bg-background">
          <Button
            onPress={() => identifyFilesModalRef.current?.present()}
            disabled={table.getSelectedRowModel().flatRows.length === 0}>
            <Text>
              {table.getSelectedRowModel().flatRows.length === 0
                ? 'Identify files as a book'
                : table.getSelectedRowModel().flatRows.length === 1
                  ? 'Identify 1 file as a book'
                  : `Identify ${table.getSelectedRowModel().flatRows.length} files as a book`}
            </Text>
          </Button>
        </View>
      </View>

      <IdentifyFilesModal
        modalRef={identifyFilesModalRef}
        selectedRows={table.getSelectedRowModel().flatRows}
        grouping={grouping}
        columnVisibility={columnVisibility}
      />
    </>
  );
}

const IdentifyFilesModal = ({
  selectedRows,
  modalRef,
  grouping,
  columnVisibility,
}: {
  selectedRows: Row<
    inferRouterOutputs<AppRouter>['v1']['library']['unidentified']['getFiles'][number]
  >[];
  modalRef: React.RefObject<BottomSheetModalType | null>;
  grouping: GroupingState;
  columnVisibility: VisibilityState;
}) => {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const idNum = parseInt(libraryId);

  const apiInstance = useApiInstance();

  const pickSearchResultModalRef = useRef<BottomSheetModalType | null>(null);

  const searchViaAudibleMutation = useMutation(
    apiInstance.v1.library.unidentified.search.mutationOptions({
      onSuccess: (data) => {
        if (data.length > 0) {
          pickSearchResultModalRef.current?.present();
        } else {
          toast.error('No results found for your search query', {
            description: 'Try again with a different search query',
          });
        }
      },
      onError: (error) => {
        toast.error('Failed to search via Audible', {
          description: error.message || 'Unknown error',
        });
      },
    })
  );

  const selectedRowsOriginal = useMemo(() => selectedRows.map((r) => r.original), [selectedRows]);

  const selectedFilesDurationMs = useMemo(() => {
    return selectedRowsOriginal.reduce((acc, row) => acc + row.durationMs, 0);
  }, [selectedRowsOriginal]);

  const selectedFilesTable = useReactTable({
    data: selectedRowsOriginal,
    columns: unidentifiedFilesColumns,
    initialState: {
      sorting: [
        { id: 'disc', desc: false },
        { id: 'track', desc: false },
      ],
    },
    state: { grouping, columnVisibility },
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    enableRowSelection: false,
    enableSubRowSelection: false,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${row.directory}/${row.name}`,
  });

  const SearchViaAudibleForm = useAppForm({
    defaultValues: {} as z.infer<typeof schemas.v1.library.unidentified.search>,
    validators: {
      onChange: schemas.v1.library.unidentified.search,
    },
    onSubmit: async ({ value, formApi }) => {
      await searchViaAudibleMutation.mutateAsync(
        schemas.v1.library.unidentified.search.parse(value)
      );
    },
  });

  const { dismissAll } = useBottomSheetModal();

  const identifyViaAudibleMutation = useMutation(
    apiInstance.v1.library.unidentified.identify.mutationOptions({
      onSuccess: (data) => {
        toast.success(
          `${selectedRows.length === 0 ? 'Files' : selectedRows.length === 1 ? 'File' : `${selectedRows.length} files`} identified successfully`,
          {
            action: (
              <Link
                href={{ pathname: '/book/[bookId]', params: { bookId: data.id } }}
                asChild
                push
                withAnchor>
                <Button variant="secondary" size="sm">
                  <Text>View book</Text>
                </Button>
              </Link>
            ),
          }
        );

        dismissAll();
      },
      onError: (error) => {
        toast.error(error.message, {
          description: error.data?.description,
        });
      },
    })
  );

  return (
    <>
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing={true}
        onDismiss={() => {
          SearchViaAudibleForm.reset();
          searchViaAudibleMutation.reset();
        }}>
        <BottomSheetFlatList
          contentContainerClassName="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5"
          data={[]}
          renderItem={null}
          ListHeaderComponent={
            <>
              <Large className="pb-2">
                {selectedRows.length === 0
                  ? 'Identify files as a book'
                  : selectedRows.length === 1
                    ? 'Identify 1 file as a book'
                    : `Identify ${selectedRows.length} files as a book`}
              </Large>

              <Accordion type="single" collapsable className="mb-4">
                <AccordionItem value="files">
                  <AccordionTrigger>
                    <Text>{selectedRows.length === 1 ? 'Selected file' : 'Selected files'}</Text>
                  </AccordionTrigger>
                  <AccordionContent>
                    {selectedFilesTable.getRowModel().rows.map((row, index) => (
                      <RenderRow
                        className={index === 0 ? 'mt-0' : ''}
                        key={row.id}
                        row={row}
                        variant="FlatList"
                      />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          }
          ListFooterComponent={
            <SearchViaAudibleForm.AppForm>
              <SearchViaAudibleForm.AppField
                name="asin"
                children={(field) => (
                  <field.TextField
                    className="pb-2"
                    label="ASIN"
                    inputProps={{ autoCorrect: false, autoCapitalize: 'characters' }}
                  />
                )}
              />

              <View className="flex flex-row items-center">
                <Separator orientation="horizontal" className="flex-1" />
                <Text className="px-2">or</Text>
                <Separator orientation="horizontal" className="flex-1" />
              </View>

              <SearchViaAudibleForm.AppField
                name="title"
                children={(field) => (
                  <field.TextField label="Title" inputProps={{ autoCorrect: false }} />
                )}
              />

              <SearchViaAudibleForm.AppField
                name="author"
                children={(field) => (
                  <field.TextField label="Author" inputProps={{ autoCorrect: false }} />
                )}
              />

              <SearchViaAudibleForm.SubmitButton>
                <Text>Search via Audible</Text>
              </SearchViaAudibleForm.SubmitButton>
            </SearchViaAudibleForm.AppForm>
          }
        />
      </BottomSheetModal>

      <BottomSheetModal
        ref={pickSearchResultModalRef}
        enableDynamicSizing={true}
        onDismiss={() => {
          identifyViaAudibleMutation.reset();
        }}>
        <BottomSheetFlatList
          contentContainerClassName="p-6 mx-auto w-full max-w-[400px] flex-col gap-2"
          windowSize={5}
          data={searchViaAudibleMutation.data}
          renderItem={({
            item: result,
          }: {
            item: NonNullable<typeof searchViaAudibleMutation.data>[number];
          }) => (
            <View className="flex flex-col gap-y-2 rounded-md border border-foreground/15 p-2">
              <View className="flex flex-row items-center justify-center gap-x-2">
                <AspectRatio
                  ratio={1 / 1}
                  className="flex w-32 flex-shrink items-center justify-center">
                  <Image
                    className="h-full w-full rounded-md"
                    source={result.product_images?.[500]}
                    cachePolicy="none"
                  />
                </AspectRatio>
                <View className="flex flex-1 flex-col gap-y-1">
                  <Large>{result.title}</Large>
                  <View className="flex flex-row flex-nowrap items-center justify-start gap-1">
                    <Badge variant="outline">
                      <Timer className="text-muted-foreground" size={20} />
                    </Badge>
                    <View className="flex flex-shrink flex-row flex-wrap items-center gap-1">
                      <Badge variant="outline">
                        <Text>
                          {formatDuration(result.runtime_length_min * 60 * 1000, 'short')}
                        </Text>
                      </Badge>
                      <Badge
                        variant={
                          Math.abs(
                            selectedFilesDurationMs - result.runtime_length_min * 60 * 1000
                          ) <=
                          5 * 60 * 1000
                            ? 'success'
                            : 'outline'
                        }>
                        <Text>
                          {selectedFilesDurationMs > result.runtime_length_min * 60 * 1000
                            ? '+ '
                            : '- '}
                          {formatDuration(
                            Math.abs(
                              selectedFilesDurationMs - result.runtime_length_min * 60 * 1000
                            ),
                            'short'
                          )}
                        </Text>
                      </Badge>
                    </View>
                  </View>
                  {result.authors.length > 0 ? (
                    <View className="flex flex-row flex-nowrap items-center justify-start gap-1">
                      <Badge variant="outline">
                        <PenTool className="text-muted-foreground" size={20} />
                      </Badge>
                      <View className="flex flex-shrink flex-row flex-wrap items-center gap-1">
                        {result.authors.map((author, index) => (
                          <Badge key={index} variant="secondary">
                            <Text>{author.name}</Text>
                          </Badge>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {result.narrators && result.narrators.length > 0 ? (
                    <View className="flex flex-row flex-nowrap items-center justify-start gap-1">
                      <Badge variant="outline">
                        <MicVocal className="text-muted-foreground" size={20} />
                      </Badge>
                      <View className="flex flex-shrink flex-row flex-wrap items-center gap-1">
                        {result.narrators.map((narrator, index) => (
                          <Badge key={index} variant="secondary">
                            <Text>{narrator.name}</Text>
                          </Badge>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {result.series && result.series.length > 0 ? (
                    <View className="flex flex-row flex-nowrap items-center justify-start gap-1">
                      <Badge variant="outline">
                        <BookCopy className="text-muted-foreground" size={20} />
                      </Badge>
                      <View className="flex flex-shrink flex-row flex-wrap items-center gap-1">
                        {result.series.map((series, index) => (
                          <Badge key={index} variant="secondary" className="flex-nowrap gap-2">
                            <Text>{series.sequence}</Text>
                            <Text className="flex-shrink border-l border-muted-foreground/50 pl-2">
                              {series.title}
                            </Text>
                          </Badge>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
              <ButtonWithLoading
                className="w-full"
                size="sm"
                variant="secondary"
                isLoading={
                  identifyViaAudibleMutation.isPending &&
                  identifyViaAudibleMutation.variables.asin === result.asin
                }
                disabled={identifyViaAudibleMutation.isPending}
                onPress={() => {
                  identifyViaAudibleMutation.mutateAsync({
                    libraryId: idNum,
                    asin: result.asin,
                    files: selectedRowsOriginal.map((row) => ({
                      directory: row.directory,
                      name: row.name,
                    })),
                  });
                }}>
                <Text>Identify as book</Text>
              </ButtonWithLoading>
            </View>
          )}
          ListHeaderComponent={
            <>
              <View>
                <Large>
                  {searchViaAudibleMutation.data
                    ? searchViaAudibleMutation.data.length === 0
                      ? `No `
                      : `${searchViaAudibleMutation.data.length} `
                    : null}
                  Search Results
                </Large>
                <Muted>
                  Pick a book to identify{' '}
                  {selectedRows.length === 0
                    ? 'files'
                    : selectedRows.length === 1
                      ? '1 file'
                      : `${selectedRows.length} files`}{' '}
                  as
                </Muted>
              </View>

              <Accordion type="single" collapsable className="mb-4">
                <AccordionItem value="files">
                  <AccordionTrigger>
                    <Text>{selectedRows.length === 1 ? 'Selected file' : 'Selected files'}</Text>
                  </AccordionTrigger>
                  <AccordionContent>
                    {selectedFilesTable.getRowModel().rows.map((row, index) => (
                      <RenderRow
                        className={index === 0 ? 'mt-0' : ''}
                        key={row.id}
                        row={row}
                        variant="FlatList"
                      />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {searchViaAudibleMutation.error ? (
                <>
                  <Alert className="mb-2" icon={OctagonAlert} variant="destructive">
                    <AlertTitle className="pb-2">
                      Failed to get search results via Audible
                    </AlertTitle>
                    <AlertDescription>
                      {searchViaAudibleMutation.error.message ||
                        'An unknown error occurred while searching via Audible'}
                    </AlertDescription>
                  </Alert>
                  <Button
                    onPress={() => {
                      pickSearchResultModalRef.current?.dismiss();
                    }}>
                    <Text>Try searching again</Text>
                  </Button>
                </>
              ) : null}
            </>
          }
          ListEmptyComponent={
            searchViaAudibleMutation.isPending ? (
              <View className="items-center justify-center p-12">
                <Spinner size={15} />
              </View>
            ) : (
              <View className="mb-4 flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed border-muted px-8 py-16">
                <Text className="text-center">No downloads found</Text>
              </View>
            )
          }
        />
      </BottomSheetModal>
    </>
  );
};

const TableCheckbox = ({
  row,
}: {
  row: Row<inferRouterOutputs<AppRouter>['v1']['library']['unidentified']['getFiles'][number]>;
}) => {
  // NOTE: row selection doesn't work correctly for parent rows
  // with deeply nested rows or if a row is selected and then grouped
  // in tanstack table, so these calculations are a workaround for this
  // see: https://github.com/TanStack/table/issues/4878

  const leafRows = row.getLeafRows().filter((row) => row.subRows.length === 0);

  const checked =
    leafRows.length > 0 ? leafRows.every((row) => row.getIsSelected()) : row.getIsSelected();

  const indeterminate = leafRows.length > 0 && leafRows.some((row) => row.getIsSelected());

  return (
    <View>
      <Pressable
        className="flex-1 items-center justify-center"
        onPress={row.getToggleSelectedHandler()}>
        <Checkbox
          checked={checked}
          indeterminate={indeterminate}
          onCheckedChange={row.getToggleSelectedHandler()}
          className={`border-foreground/15 ${checked || indeterminate ? 'bg-secondary' : ''}`}
        />
      </Pressable>
    </View>
  );
};

const RenderRow = ({
  row,
  variant,
  className,
}: {
  row: Row<inferRouterOutputs<AppRouter>['v1']['library']['unidentified']['getFiles'][number]>;
  variant: 'FlashList' | 'FlatList';
  className?: string;
}) =>
  row.getIsGrouped() ? (
    <GroupedRow row={row} variant={variant} className={className} />
  ) : (
    <RowCard row={row} className={className} />
  );

const GroupedRow = ({
  row,
  variant = 'FlashList',
  className,
}: {
  row: Row<inferRouterOutputs<AppRouter>['v1']['library']['unidentified']['getFiles'][number]>;
  variant: 'FlashList' | 'FlatList';
  className?: string;
}) => {
  const groupedCell = row.getVisibleCells().find((cell) => cell.getIsGrouped());

  if (!groupedCell) return null;

  return (
    <View className={cn('mt-2 rounded-md border border-foreground/15 px-3 py-2', className)}>
      <View className="flex flex-row items-center gap-x-2">
        {row.getCanSelect() ? <TableCheckbox row={row} /> : null}
        <Button
          onPress={row.getToggleExpandedHandler()}
          size="sm"
          variant="ghost"
          className="native:h-fit h-fit w-full flex-1 flex-row justify-start gap-x-1">
          {row.getIsExpanded() ? (
            <ChevronDown className="-ml-2 text-muted-foreground" size={18} />
          ) : (
            <ChevronRight className="-ml-2 text-muted-foreground" size={18} />
          )}
          <View>
            {typeof groupedCell.column.columnDef.header === 'string' ? (
              <Muted className="leading-tight">{groupedCell.column.columnDef.header}</Muted>
            ) : null}
            <Text>{flexRender(groupedCell.column.columnDef.cell, groupedCell.getContext())}</Text>
          </View>
        </Button>
      </View>

      {row.getIsExpanded() ? (
        variant === 'FlashList' ? (
          <FlashList
            data={row.subRows}
            renderItem={({ item: row }) => <RenderRow row={row} variant={variant} />}
          />
        ) : (
          <FlatList
            data={row.subRows}
            renderItem={({ item: subRow }) => <RenderRow row={subRow} variant={variant} />}
          />
        )
      ) : null}
    </View>
  );
};

const RowCard = ({
  row,
  className,
}: {
  row: Row<inferRouterOutputs<AppRouter>['v1']['library']['unidentified']['getFiles'][number]>;
  className?: string;
}) => {
  return (
    <View className={cn('mt-2 overflow-hidden rounded-md border border-foreground/15', className)}>
      {row.getCanSelect() ? (
        <Pressable
          className="flex flex-row items-center gap-x-4 px-3 py-2"
          onPress={row.getToggleSelectedHandler()}>
          <TableCheckbox row={row} />
          <Text>Select file to be identified</Text>
        </Pressable>
      ) : null}
      {row
        .getVisibleCells()
        .filter((cell) => !cell.getIsPlaceholder())
        .map((cell, index) => (
          <View
            key={cell.id}
            className={`border-foreground/15 px-3 py-1 ${row.getCanSelect() || index > 0 ? 'border-t' : ''}`}>
            {typeof cell.column.columnDef.header === 'string' ? (
              <Muted className="leading-tight">{cell.column.columnDef.header}</Muted>
            ) : null}
            {cell.getIsAggregated() ? (
              <Text>
                {flexRender(
                  cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell,
                  cell.getContext()
                )}
              </Text>
            ) : cell.getIsPlaceholder() ? null : (
              <Text>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Text>
            )}
          </View>
        ))}
    </View>
  );
};
