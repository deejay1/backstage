/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { screen, waitFor, within } from '@testing-library/react';
import { renderTestApp } from '@backstage/frontend-test-utils';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import {
  PageBlueprint,
  createExtension,
  createFrontendModule,
  createRouteRef,
  errorApiRef,
} from '@backstage/frontend-plugin-api';
import { withLogCollector } from '@backstage/test-utils';
import { legacyNavItemTargetDataRef } from './legacyNavItem';

const DEFAULT_CONFIG = {
  app: { baseUrl: 'http://localhost:3000' },
  backend: { baseUrl: 'http://localhost:7007' },
};

const mockRouteRef = createRouteRef();

const mockPage = PageBlueprint.make({
  name: 'my-plugin',
  params: {
    title: 'My Plugin',
    icon: <span>icon</span>,
    path: '/my-plugin',
    routeRef: mockRouteRef,
  },
});

const mockLegacyNavItem = createExtension({
  kind: 'nav-item',
  name: 'my-plugin',
  attachTo: { id: 'app/nav', input: 'items' },
  output: [legacyNavItemTargetDataRef],
  factory: () => [
    legacyNavItemTargetDataRef({
      title: 'Legacy Nav Title',
      icon: () => <span>legacy icon</span>,
      routeRef: mockRouteRef,
    }),
  ],
});

describe('AppNav', () => {
  it('should show a nav item for a page with title and icon', async () => {
    renderTestApp({
      extensions: [mockPage],
      config: DEFAULT_CONFIG,
    });

    await waitFor(() => {
      expect(
        within(screen.getByRole('navigation')).getByText('My Plugin'),
      ).toBeInTheDocument();
    });
  });

  it('should merge legacy nav item metadata when page has no explicit title', async () => {
    const pageWithoutTitle = PageBlueprint.make({
      name: 'legacy-plugin',
      params: {
        path: '/legacy-plugin',
        routeRef: mockRouteRef,
        icon: <span>page icon</span>,
      },
    });

    renderTestApp({
      extensions: [pageWithoutTitle, mockLegacyNavItem],
      config: DEFAULT_CONFIG,
    });

    await waitFor(() => {
      expect(
        within(screen.getByRole('navigation')).getByText('Legacy Nav Title'),
      ).toBeInTheDocument();
    });
  });

  it('should isolate errors thrown by custom nav content', async () => {
    const throwingNavModule = createFrontendModule({
      pluginId: 'app',
      extensions: [
        NavContentBlueprint.make({
          params: {
            component: () => {
              throw new Error('nav content failed');
            },
          },
        }),
      ],
    });
    const page = PageBlueprint.make({
      name: 'content',
      params: {
        path: '/content',
        loader: async () => <div>Page content</div>,
      },
    });
    const errorApi = {
      post: jest.fn(),
      error$: jest.fn(),
    };

    const { error } = await withLogCollector(['error'], async () => {
      renderTestApp({
        extensions: [page],
        features: [throwingNavModule],
        apis: [[errorApiRef, errorApi]],
        config: DEFAULT_CONFIG,
        initialRouteEntries: ['/content'],
      });

      expect(await screen.findByText('Page content')).toBeInTheDocument();
      expect(screen.queryByText('nav content failed')).not.toBeInTheDocument();
    });

    expect(errorApi.post).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('nav content failed'),
      }),
    );
    expect(error).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('nav content failed'),
        }),
      ]),
    );
  });
});
