import { DB } from '@op-engineering/op-sqlite';
import { useDevToolsPluginClient } from 'expo/devtools';
import { useCallback, useEffect } from 'react';

export default function useDrizzleStudio(db: DB) {
  const client = useDevToolsPluginClient('expo-drizzle-studio-plugin');

  const transferData = useCallback(
    async (e: { sql: string; params: (string | number)[]; arrayMode: boolean; id: string }) => {
      if (!db) return;
      try {
        const statement = db.prepareStatement(e.sql);
        statement.bind(e.params);
        let executed = await statement.execute();

        if (e.arrayMode) {
          // Object.values doesn't work
          const rowsAsArrays = executed.rows.map((row) => {
            const values = [];
            for (const key in row) {
              values.push(row[key]);
            }
            return values;
          });
          client?.sendMessage(`transferData-${e.id}`, { from: 'app', data: rowsAsArrays });
        } else {
          client?.sendMessage(`transferData-${e.id}`, { from: 'app', data: executed.rows });
        }
      } catch (error) {
        console.error(error);
      }
    },
    [db, client]
  );

  useEffect(() => {
    const subscriptions: any[] = [];

    subscriptions.push(client?.addMessageListener('getData', transferData));

    return () => {
      for (const subscription of subscriptions) {
        subscription?.remove();
      }
    };
  }, [client, transferData]);
}
