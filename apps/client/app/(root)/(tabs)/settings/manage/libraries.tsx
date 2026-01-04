import {
  type BottomSheetModal as BottomSheetModalType,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { LegendList } from '@legendapp/list';
import { useMutation } from '@tanstack/react-query';
import { schemas } from '@voel/schemas';
import { Link, Stack } from 'expo-router';
import { useRef } from 'react';
import { Platform, View } from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { toast } from 'sonner-native';

import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';
import { useApiInstance } from '~/lib/stores/instance';
import { cn } from '~/lib/utils';

export default function LibraryListScreen() {
  const apiInstance = useApiInstance();
  const { data, error, refetch, isFetching } = api.libraries.list.useQuery();
  const tabBarHeight = useBottomTabBarHeight();

  const createLibraryModalRef = useRef<BottomSheetModalType>(null);

  const createLibraryMutation = useMutation(
    apiInstance.v1.library.create.mutationOptions({
      onSuccess: () => {
        toast.success('Library created successfully');
      },
      onError: (error) => {
        toast.error('Failed to create library', { description: error.message || 'Unknown error' });
      },
    })
  );

  const CreateLibraryForm = useAppForm({
    defaultValues: {
      name: '',
      path: '',
    },
    validators: {
      onChange: schemas.v1.library.create,
    },
    onSubmit: async ({ value, formApi }) => {
      await createLibraryMutation.mutateAsync(schemas.v1.library.create.parse(value));
      createLibraryModalRef.current?.dismiss();
      createLibraryMutation.reset();
      formApi.reset();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Manage Libraries', headerTitleAlign: 'center' }} />
      <LegendList
        recycleItems={true}
        data={data ?? []}
        keyExtractor={(item) => item.id.toString()}
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        ListHeaderComponent={
          <>
            <Button
              variant="secondary"
              onPress={() => {
                createLibraryModalRef.current?.present();
              }}>
              <Text>Create New Library</Text>
            </Button>

            <TitleWithRefetch className="pt-4" refetch={refetch} isFetching={isFetching}>
              Libraries
            </TitleWithRefetch>
          </>
        }
        ItemSeparatorComponent={() => <View className="h-px bg-foreground/15" />}
        renderItem={({ item, index }) => (
          <Link
            href={{
              pathname: '/settings/manage/libraries/[libraryId]',
              params: { libraryId: item.id },
            }}
            asChild
            push>
            <Button
              variant="ghost"
              className={cn(
                'native:h-fit h-fit flex-row items-center justify-between rounded-none bg-secondary/40',
                index === 0 ? 'mt-4 rounded-t-md' : '',
                index === data!.length - 1 ? 'rounded-b-md' : ''
              )}>
              <View className="flex-1">
                <Text>{item.name}</Text>
                <Text className="text-muted-foreground">{item.path}</Text>
              </View>
              <ChevronRight className="flex-shrink text-muted-foreground" size="20" />
            </Button>
          </Link>
        )}
        ListEmptyComponent={
          error ? (
            <Card className="mt-4">
              <CardContent className="pt-4">
                <Large>Error loading libraries</Large>
                <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => refetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          ) : data?.length === 0 ? (
            <View className="mb-4 mt-4 flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted p-8">
              <Text className="text-center">No libraries found</Text>
            </View>
          ) : (
            <CardContent className="items-center justify-center p-12">
              <Spinner size={15} />
            </CardContent>
          )
        }
        ListFooterComponent={
          <View style={{ paddingBottom: Platform.OS === 'ios' ? tabBarHeight : 0 }} />
        }
      />

      <BottomSheetModal ref={createLibraryModalRef}>
        <BottomSheetScrollView>
          <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 p-6">
            <Large className="pb-2">Create New Library</Large>
            <CreateLibraryForm.AppForm>
              <CreateLibraryForm.AppField
                name="name"
                children={(field) => (
                  <field.TextField
                    label="Name"
                    inputProps={{
                      autoComplete: 'name',
                      autoCorrect: false,
                      placeholder: 'Alexandria',
                    }}
                  />
                )}
              />
              <CreateLibraryForm.AppField
                name="path"
                children={(field) => (
                  <field.TextField
                    label="Absolute Path"
                    inputProps={{
                      autoCorrect: false,
                      placeholder: '/path/to/library',
                    }}
                  />
                )}
              />

              <CreateLibraryForm.SubmitButton>
                <Text>Create New Library</Text>
              </CreateLibraryForm.SubmitButton>
            </CreateLibraryForm.AppForm>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
}
